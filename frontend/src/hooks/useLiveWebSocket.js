import { useState, useEffect, useCallback, useRef } from 'react';

export const useLiveWebSocket = (sessionId) => {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const isUnmountedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  // Helper: safely close socket and detach listeners to prevent stale callbacks
  const cleanSocket = (socket) => {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    } catch (_) {}
  };

  const scheduleReconnect = useCallback(() => {
    if (isUnmountedRef.current || !sessionId) return;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    // Exponential backoff: 1.5s, 3s, 5s, max 10s
    const attempts = reconnectAttemptsRef.current;
    const delay = Math.min(1500 * Math.pow(1.5, attempts), 10000);
    reconnectAttemptsRef.current = attempts + 1;

    reconnectTimerRef.current = setTimeout(() => {
      if (!isUnmountedRef.current) {
        connect();
      }
    }, delay);
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(() => {
    if (!sessionId || isUnmountedRef.current) return;

    // Prevent duplicate connections if already open or connecting
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    if (wsRef.current) {
      cleanSocket(wsRef.current);
      wsRef.current = null;
    }

    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
    if (!token) {
      setError(new Error('No access token available'));
      // Retry in case token is currently being loaded/refreshed
      scheduleReconnect();
      return;
    }

    // Determine WebSocket protocol based on HTTP protocol
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // Determine host: prefer VITE_API_URL host, fallback to window.location.host
    let host = '';
    const envApiUrl = import.meta.env.VITE_API_URL;
    if (envApiUrl) {
      try {
        const url = new URL(envApiUrl);
        host = url.host;
      } catch (_) {
        host = window.location.host;
      }
    } else {
      host = window.location.host;
    }

    const wsUrl = `${wsProtocol}//${host}/ws/live_sessions/${sessionId}/admin/?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Guard against race conditions (e.g. React 18 StrictMode double-mount or superseded sockets)
        if (wsRef.current !== ws || isUnmountedRef.current) {
          cleanSocket(ws);
          return;
        }

        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Keep-alive ping every 25s to avoid idle proxy or Daphne timeouts
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch (_) {}
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws || isUnmountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          // Ignore pong keepalives
          if (data?.type === 'pong' || data?.name === 'pong') return;

          setLastEvent(data);
          // Bounded buffer: cap at 100 to prevent memory growth during long streams
          setEvents((prev) => {
            const next = [...prev, data];
            return next.length > 100 ? next.slice(next.length - 100) : next;
          });
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws || isUnmountedRef.current) return;
        setError(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        // Only handle close for the currently active socket
        if (wsRef.current !== ws) return;

        wsRef.current = null;
        setConnected(false);

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (!isUnmountedRef.current) {
          scheduleReconnect();
        }
      };
    } catch (err) {
      setError(err);
      setConnected(false);
      scheduleReconnect();
    }
  }, [sessionId, scheduleReconnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      cleanSocket(wsRef.current);
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setTimeout(() => {
      if (!isUnmountedRef.current) {
        connect();
      }
    }, 200);
  }, [disconnect, connect]);

  useEffect(() => {
    isUnmountedRef.current = false;
    if (sessionId) {
      connect();
    }
    return () => {
      isUnmountedRef.current = true;
      disconnect();
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connected,
    events,
    lastEvent,
    error,
    reconnect,
    disconnect,
  };
};
