import os
import sys
import asyncio
import logging
import time
import subprocess
from typing import Optional, Tuple, List
from dataclasses import dataclass
from live_studio.core.telemetry import telemetry

logger = logging.getLogger(__name__)

@dataclass
class StreamConfig:
    width: int = 720
    height: int = 1280
    fps: int = 30
    video_pixel_format: str = "rgb24"
    video_codec: str = "libx264"
    bitrate: str = "2500k"
    audio_sample_rate: int = 44100
    audio_channels: int = 2
    audio_format: str = "s16le"
    bgm_volume: float = 0.35
    ai_volume: float = 1.0


class FfmpegLocator:
    def __init__(self, override_path: str = None):
        self.override_path = override_path
        
    async def locate(self) -> Optional[str]:
        candidates = []
        if self.override_path:
            candidates.append(self.override_path)
            
        import sys
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.dirname(__file__))
        candidates.extend([
            os.path.join(base_dir, "bin", "ffmpeg.exe"),
            os.path.join(base_dir, "bin", "ffmpeg", "ffmpeg.exe"),
            os.path.join(base_dir, "..", "..", "bin", "ffmpeg.exe"),
            os.path.join(base_dir, "..", "..", "bin", "ffmpeg", "ffmpeg.exe"),
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "bin", "ffmpeg.exe"),
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "bin", "ffmpeg", "ffmpeg.exe"),
            "ffmpeg"
        ])
        
        flags = 0x08000000 if sys.platform == 'win32' else 0
        for candidate in candidates:
            try:
                proc = await asyncio.create_subprocess_exec(
                    candidate, "-version",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    creationflags=flags
                )
                await proc.communicate()
                if proc.returncode == 0:
                    return candidate
            except FileNotFoundError:
                continue
            except Exception as e:
                logger.debug(f"Error checking ffmpeg candidate {candidate}: {e}")
                continue
                
        return None


class HardwareEncoderProbe:
    def __init__(self, ffmpeg_path: str):
        self.ffmpeg_path = ffmpeg_path
        
    async def _test_encoder(self, encoder: str) -> bool:
        flags = 0x08000000 if sys.platform == 'win32' else 0
        try:
            proc = await asyncio.create_subprocess_exec(
                self.ffmpeg_path,
                "-nostats", "-loglevel", "quiet",
                "-f", "lavfi", "-i", "nullsrc",
                "-c:v", encoder,
                "-frames:v", "1",
                "-f", "null", "-",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
                creationflags=flags
            )
            await asyncio.wait_for(proc.wait(), timeout=1.5)
            return proc.returncode == 0
        except Exception:
            return False

    async def probe(self) -> Tuple[str, List[str]]:
        """
        Probes for available hardware encoders by actually running a 1-frame test.
        Returns: (preferred_encoder, [list of available encoders])
        """
        candidates = ["h264_nvenc", "h264_qsv", "h264_mf", "h264_amf"]
        available = []
        for enc in candidates:
            if await self._test_encoder(enc):
                available.append(enc)
                
        available.append("libx264")
        preferred = available[0]
        telemetry.set_encoder(preferred, available)
        return preferred, available


class LocalTcpTransport:
    """
    Provides a deterministic local transport for pushing raw video/audio to FFmpeg.
    Python acts as the TCP server, FFmpeg connects as the client.
    This avoids Windows Named Pipe limitations and deadlocks.
    """
    def __init__(self, host="127.0.0.1"):
        self.host = host
        self.port = 0
        self.server = None
        self.client_writer = None
        self.connected_event = asyncio.Event()
        self.close_event = asyncio.Event()
        self._write_lock = asyncio.Lock()

    async def start(self):
        self.server = await asyncio.start_server(self.handle_client, self.host, 0)
        self.port = self.server.sockets[0].getsockname()[1]
        
    async def handle_client(self, reader, writer):
        logger.debug(f"Client connected to port {self.port}!")
        self.client_writer = writer
        self.connected_event.set()
        await self.close_event.wait()
        
    async def write(self, data: bytes):
        if not self.client_writer or self.client_writer.is_closing():
            return
        async with self._write_lock:
            try:
                self.client_writer.write(data)
                # Timeout drain: if FFmpeg reads too slowly (CPU spike, encoding pressure),
                # drain() would block indefinitely, stalling the entire audio_worker task.
                # Dropping one chunk is much better than freezing all audio for seconds.
                await asyncio.wait_for(self.client_writer.drain(), timeout=0.5)
            except asyncio.TimeoutError:
                logger.warning(f"[LocalTcpTransport:{self.port}] drain() timed out (500ms). Dropping chunk to prevent audio stall.")
            except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, OSError, asyncio.CancelledError):
                pass
        
    async def close(self):
        self.close_event.set()
        if self.client_writer:
            try:
                self.client_writer.close()
                await self.client_writer.wait_closed()
            except (ConnectionResetError, BrokenPipeError, OSError):
                pass
        if self.server:
            self.server.close()
            await self.server.wait_closed()


class AVTimeline:
    """
    Shared media timeline for A/V synchronization.
    Video and Audio both calculate their PTS relative to the stream start.
    """
    def __init__(self, fps: int, sample_rate: int):
        self.start_time = time.monotonic()
        self.fps = fps
        self.sample_rate = sample_rate
        self.audio_samples_written = 0
        
    def get_video_pts(self, frame_index: int) -> float:
        return frame_index / self.fps
        
    def advance_audio(self, samples: int):
        self.audio_samples_written += samples
        
    def get_audio_pts(self) -> float:
        return self.audio_samples_written / self.sample_rate


class StreamEncoder:
    def __init__(self, config: StreamConfig, ffmpeg_path: str, output_url: str, cached_assets: dict = None):
        self.config = config
        self.ffmpeg_path = ffmpeg_path
        self.output_url = output_url
        self.cached_assets = cached_assets or {}
        self.video_transport = LocalTcpTransport()
        self.audio_transport = LocalTcpTransport()
        self.process = None
        self.timeline = AVTimeline(config.fps, config.audio_sample_rate)
        self.is_running = False
        self._intentional_stop = False
        
    def _detect_chroma_params(self) -> Tuple[str, str, str]:
        """
        Auto-detects the exact chroma key color from the avatar video by sampling corner pixels.
        Returns: (color_hex, similarity, blend)
        Preserves 100% natural colors of the model and removes despill to prevent bright spots/blotchiness.
        """
        avatar_path = self.cached_assets.get('avatar') or self.cached_assets.get('avatar_speaking')
        if avatar_path and os.path.exists(avatar_path) and self.ffmpeg_path:
            try:
                cmd = [
                    self.ffmpeg_path, '-y', '-ss', '0.5', '-i', avatar_path,
                    '-vf', 'crop=30:30:5:5,scale=1:1',
                    '-vframes', '1',
                    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
                ]
                flags = 0x08000000 if sys.platform == 'win32' else 0
                startupinfo = None
                if sys.platform == 'win32':
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startupinfo.wShowWindow = 0

                res = subprocess.run(
                    cmd,
                    capture_output=True,
                    timeout=5,
                    creationflags=flags,
                    startupinfo=startupinfo
                )
                if res.returncode == 0 and len(res.stdout) >= 3:
                    r, g, b = res.stdout[0], res.stdout[1], res.stdout[2]
                    detected_hex = f"0x{r:02X}{g:02X}{b:02X}"
                    logger.info(f"[StreamEncoder] Sampled avatar corner pixel RGB=({r}, {g}, {b}) -> {detected_hex}")
                    screen_type = "blue" if (b > r and b > g) else "green"
                    return (detected_hex, "0.038", "0.022", screen_type)
            except Exception as e:
                logger.warning(f"[StreamEncoder] Could not auto-detect chroma color: {e}")

        # Default fallback to clean green screen
        return ("0x2BB754", "0.038", "0.022", "green")

    async def start(self):
        await self.video_transport.start()
        await self.audio_transport.start()
        
        cmd = [
            self.ffmpeg_path,
            "-y",
            "-nostats",
            "-loglevel", "error"
        ]
        
        inputs = []
        # Input 0: Video (Streamed from Avatar Engine via Clock-driven TCP transport)
        inputs.extend([
            "-f", "rawvideo",
            "-pixel_format", self.config.video_pixel_format,
            "-video_size", f"{self.config.width}x{self.config.height}",
            "-framerate", str(self.config.fps),
            "-i", f"tcp://127.0.0.1:{self.video_transport.port}"
        ])
            
        # Input 1: Audio (TCP)
        inputs.extend([
            "-f", self.config.audio_format,
            "-ar", str(self.config.audio_sample_rate),
            "-ac", str(self.config.audio_channels),
            "-i", f"tcp://127.0.0.1:{self.audio_transport.port}"
        ])
        
        filter_complex = []
        video_out = "[0:v]"
        audio_out = "[1:a]"
        input_idx = 2
        
        # Background
        if self.cached_assets.get('background'):
            bg = self.cached_assets['background']
            if bg.endswith(('.mp4', '.webm')):
                inputs.extend(["-stream_loop", "-1", "-i", bg])
            else:
                inputs.extend(["-loop", "1", "-i", bg])
                
            # Calibrated chroma key + despill spill suppression for clean hair & borders
            ck_col, ck_sim, ck_blend, screen_type = self._detect_chroma_params()
            filter_complex.append(
                f"[0:v]chromakey={ck_col}:{ck_sim}:{ck_blend},despill=type={screen_type}:mix=0.5,scale=-1:{self.config.height}:eval=init[ckout];"
                f"[{input_idx}:v]scale={self.config.width}:{self.config.height}:eval=init[bg];"
                f"[bg][ckout]overlay=(W-w)/2:(H-h)/2[v1]"
            )
            video_out = "[v1]"
            input_idx += 1
            
        # Overlay
        if self.cached_assets.get('overlay'):
            inputs.extend(["-loop", "1", "-i", self.cached_assets['overlay']])
            filter_complex.append(f"[{input_idx}:v]scale={self.config.width}:{self.config.height}:eval=init[ovl];{video_out}[ovl]overlay=0:0[v2]")
            video_out = "[v2]"
            input_idx += 1
            
        # BGM
        bgm_vol = getattr(self.config, 'bgm_volume', 0.35)
        if self.cached_assets.get('audio') and bgm_vol > 0.001:
            inputs.extend(["-stream_loop", "-1", "-i", self.cached_assets['audio']])
            filter_complex.append(f"[{input_idx}:a]volume={bgm_vol:.2f}[bgm];{audio_out}[bgm]amix=inputs=2:duration=first:dropout_transition=0[a1]")
            audio_out = "[a1]"
            input_idx += 1
            
        cmd.extend(inputs)
        
        if filter_complex:
            cmd.extend(["-filter_complex", ";".join(filter_complex)])
            map_v = video_out.strip("[]") if ":" in video_out else video_out
            map_a = audio_out.strip("[]") if ":" in audio_out else audio_out
            cmd.extend(["-map", map_v, "-map", map_a])
            
        # Output params - auto-detect hardware encoder if available
        codec = self.config.video_codec
        if codec == "libx264":
            try:
                probe = HardwareEncoderProbe(self.ffmpeg_path)
                pref, _ = await probe.probe()
                if pref != "libx264":
                    codec = pref
                    logger.info(f"Hardware acceleration enabled: using '{codec}' instead of CPU libx264")
            except Exception as e:
                logger.debug(f"Hardware probe check: {e}")

        encoder_args = ["-c:v", codec, "-b:v", self.config.bitrate]
        if codec == "libx264":
            encoder_args.extend(["-preset", "ultrafast", "-tune", "zerolatency", "-bf", "0", "-threads", "3"])
        elif codec == "h264_nvenc":
            encoder_args.extend(["-preset", "p1", "-tune", "ull", "-zerolatency", "1", "-bf", "0"])
        elif codec == "h264_qsv":
            encoder_args.extend(["-preset", "veryfast", "-bf", "0"])
        elif codec == "h264_mf":
            encoder_args.extend(["-hw_encoding", "1", "-scenario", "4", "-rate_control", "0"])

        cmd.extend(encoder_args)
        
        # Native GPU pixel format for Windows MediaFoundation is nv12, CPU is yuv420p
        pix_fmt = "nv12" if codec == "h264_mf" else "yuv420p"

        # Ultra-low latency GOP: emit keyframe every 1 second (e.g. 30 frames at 30fps)
        # Slicing short HLS segments requires keyframes at least every 1s.
        gop_size = str(max(15, self.config.fps))
        cmd.extend([
            "-threads", "4",
            "-pix_fmt", pix_fmt,
            "-g", gop_size,
            "-keyint_min", gop_size,
            "-sc_threshold", "0",
            "-flags", "+global_header",
            "-fflags", "+nobuffer+flush_packets",
            "-flush_packets", "1",
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", str(self.config.audio_sample_rate),
            "-flvflags", "no_duration_filesize",
            "-f", "flv" if self.output_url.startswith("rtmp") else "null",
            self.output_url
        ])
        
        logger.info(f"FFmpeg command: {' '.join(cmd)}")
        flags = 0x08000000 if sys.platform == 'win32' else 0
        self.process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=flags
        )
        self.is_running = True
        telemetry.stream_state = "running"
        telemetry.clear_error()
        
        asyncio.create_task(self._monitor_process())

    async def _monitor_process(self):
        if not self.process:
            return
            
        try:
            while True:
                line = await self.process.stderr.readline()
                if not line:
                    break
                line_str = line.decode('utf-8', errors='ignore').strip()
                if "error" in line_str.lower() or "refused" in line_str.lower() or "failed" in line_str.lower():
                    logger.error(f"[FFmpeg] {line_str}")
                    telemetry.record_error(line_str)
                else:
                    logger.debug(f"[FFmpeg] {line_str}")
        except Exception as e:
            logger.error(f"FFmpeg monitor error: {e}")
            telemetry.record_error(f"Lỗi theo dõi FFmpeg: {e}")
            
        await self.process.wait()
        logger.info(f"FFmpeg process exited with code {self.process.returncode}")
        # On Windows, terminating a process yields exit code 1 or 255. Do not record as error if stopped intentionally.
        if not self._intentional_stop and self.process.returncode not in (0, None, -15):
            telemetry.record_error(f"FFmpeg dừng bất ngờ với mã lỗi {self.process.returncode}")
        self.is_running = False
        await self.stop()

    async def write_video(self, frame_data: bytes):
        if self.is_running and self.video_transport.client_writer:
            try:
                await self.video_transport.write(frame_data)
            except Exception as e:
                logger.debug(f"Video transport write failed: {e}")
                
    async def write_audio(self, audio_data: bytes):
        if self.is_running and self.audio_transport.client_writer:
            try:
                await self.audio_transport.write(audio_data)
                bytes_per_sample = 2 * self.config.audio_channels
                samples = len(audio_data) // bytes_per_sample
                self.timeline.advance_audio(samples)
            except Exception as e:
                logger.debug(f"Audio transport write failed: {e}")

    async def stop(self):
        self._intentional_stop = True
        self.is_running = False
        telemetry.stream_state = "stopped"
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
                
        await self.video_transport.close()
        await self.audio_transport.close()
