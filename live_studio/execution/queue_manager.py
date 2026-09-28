import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from live_studio.protocol.envelopes import SpeechSpeakPayload
from live_studio.protocol.constants import (
    PRIORITY_HIGH, PRIORITY_NORMAL,
    SPEECH_QUEUED, SPEECH_DOWNLOADING, SPEECH_READY, 
    SPEECH_PLAYING, SPEECH_COMPLETED, SPEECH_FAILED, SPEECH_INTERRUPTED
)

logger = logging.getLogger(__name__)

@dataclass(order=True)
class SpeechItem:
    # Priority for sorting: 0 (high), 1 (normal)
    sort_priority: int
    # FIFO order: incrementing counter for items with same priority
    fifo_index: int
    
    # Payload details (excluded from sorting)
    payload: SpeechSpeakPayload = field(compare=False)
    sequence_number: int = field(compare=False)
    state: str = field(default=SPEECH_QUEUED, compare=False)
    error_code: Optional[str] = field(default=None, compare=False)

class SpeechQueueManager:
    def __init__(self):
        self._queue = asyncio.PriorityQueue()
        self._fifo_counter = 0
        self._items: Dict[str, SpeechItem] = {}
        
    def enqueue(self, payload: SpeechSpeakPayload, sequence_number: int) -> SpeechItem:
        sort_prio = 0 if payload.priority == PRIORITY_HIGH else 1
        self._fifo_counter += 1
        
        item = SpeechItem(
            sort_priority=sort_prio,
            fifo_index=self._fifo_counter,
            payload=payload,
            sequence_number=sequence_number
        )
        self._items[payload.command_id] = item
        self._queue.put_nowait(item)
        logger.info(f"Enqueued {payload.command_id} with priority {payload.priority}")
        return item

    async def get_next(self) -> SpeechItem:
        item = await self._queue.get()
        return item

    def get_item(self, command_id: str) -> Optional[SpeechItem]:
        return self._items.get(command_id)

    def mark_done(self, item: SpeechItem):
        self._queue.task_done()
        if item.payload.command_id in self._items:
            del self._items[item.payload.command_id]

    def flush(self) -> list[SpeechItem]:
        """
        Flushes the queue. Returns the list of flushed items.
        """
        flushed_items = []
        while not self._queue.empty():
            try:
                item = self._queue.get_nowait()
                flushed_items.append(item)
                self._queue.task_done()
                if item.payload.command_id in self._items:
                    del self._items[item.payload.command_id]
            except asyncio.QueueEmpty:
                break
        return flushed_items
