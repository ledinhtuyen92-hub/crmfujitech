# Phase 1D-7F: Live AI Response Engine - Pre-Implementation Audit

## 1. Current AI Architecture & Core Components
- **Entry Point**: `LiveOrchestrator.process_comment` (`backend/live_sessions/orchestrator.py`) handles the end-to-end flow: Validation -> RAG -> AI Core -> TTS -> Command Protocol -> WebSocket.
- **AI Core (`backend/ai_agents/services.py`)**: 
  - `generate_ai_reply` is the primary workhorse. It already supports multi-provider rotation (OpenAI, Gemini, Anthropic), structured JSON outputs, and cost/token tracking.
  - The JSON schema is defined globally in `DEFAULT_JSON_TEMPLATE` and can be overridden per agent.
- **RAG (`backend/ai_agents/rag_processor.py`)**: 
  - `search_knowledge` supports vector search (CosineDistance on pgvector).
  - Already supports `product_id` filtering, prioritizing Q&A format over general documents.

## 2. Intent Architecture
- **Current State**: No separate Intent Router or classification layer exists. Every comment currently goes directly to the main AI Agent via `generate_ai_reply`.
- **Recommendation**: To avoid the latency and cost of invoking a heavy model (e.g., GPT-4o) for simple spam or off-topic messages, we should introduce a lightweight Intent Classification layer (using rules, regex, or a fast model like Gemini Flash Lite / GPT-4o-mini) *before* triggering the full AI Core + TTS pipeline. If a comment is `SPAM` or `UNKNOWN`, we can drop it early.

## 3. Product Truth vs Product Knowledge
- **Product Truth**: Resides in `inventory.Product` (SKU, name, standard price, attributes), `inventory.StockLevel` (real-time quantity), and `LivePlatformProduct` (live_price_override, platform identifiers). This data must be passed directly into the system prompt or Live Context, bypassing RAG to guarantee 100% accuracy on price and stock.
- **Product Knowledge**: Resides in `AiKnowledgeDocument` / `AiKnowledgeChunk`. Used strictly for qualitative data (materials, warranties, styling advice). 

## 4. RAG
- The existing architecture (`search_knowledge`) already handles semantic chunk retrieval and respects the `product_id`. We do not need to rewrite the RAG system. We only need to ensure `LiveOrchestrator` passes the correct `product_id` dynamically based on the active product in the livestream.

## 5. Live Context
- **Current State**: `LiveOrchestrator` currently instantiates a fresh `conversation_history` for *every* comment containing only the RAG context and the current `user_message`. It lacks historical context of the live session.
- **Recommendation**: We must utilize the existing `LiveContextService` (Redis) to store and retrieve:
  - `recent_comments` (a sliding window of the last N comments)
  - `recent_ai_responses`
  - `current_active_product`
  - This ensures the AI understands the ongoing conversation thread without turning Redis into a permanent database (Redis keys already have a TTL of 24h).

## 6. Prompt Hierarchy
The existing hierarchy is well-defined in `generate_ai_reply`:
1. System Prompt (Agent Persona)
2. Core System Rules
3. [Live Context - *To be injected*]
4. RAG Context (Internal Knowledge)
5. User Message
6. Output JSON Format

## 7. Response Contract
- The current AI Core returns a structured JSON object (`thought`, `reply`, `sentiment`, `extracted_info`, etc.).
- **Recommendation**: Extend the existing `DEFAULT_JSON_TEMPLATE` or Live Agent config to include `intent` and `action` (e.g., `SPEAK`, `IGNORE`) explicitly, ensuring the AI can decide whether a TTS response is actually necessary.

## 8. Human Takeover
- **Current State**: Already implemented. `LiveOrchestrator` correctly checks `if session.status == LiveSession.STATUS_HUMAN_TAKEOVER:` and returns early (`suppressed`).
- No further implementation is strictly required for this guard, other than ensuring context handles the transition smoothly (e.g., AI doesn't reply to comments made while human was active).

## 9. Model/Cost Routing
- The AI Core already supports `fallback_model` and `get_api_keys` rotation. We can leverage lightweight models (`gpt-4o-mini` / `gemini-2.0-flash`) as the default engine for Livestream parsing, given the high volume of comments.

## 10. Error Handling
- Handled safely in `LiveOrchestrator`: RAG exceptions are caught and bypassed. AI exceptions result in `{"status": "error", "reason": "ai_failure"}` without crashing the Celery polling worker. TTS and Storage failures are also caught cleanly.

## 11. Tenant Isolation
- `AiAgent`, `LiveSession`, `Product`, and `AiKnowledgeDocument` are all strongly linked to `company_id`.
- RAG restricts search via `document__agent__company`.
- Redis `LiveContextService` uses `company_id` in its keys.

## 12. Security
- LLM outputs must be sanitized before creating TTS audio to prevent prompt injection causing the AI to speak malicious content or raw JSON.
- LLMs will not generate Shopee item IDs or raw database URLs directly.

## 13. Test Strategy
1. **Context injection tests**: Ensure `LiveContextService` sliding window limits correctly.
2. **Product Truth Priority**: Mock `inventory.Product` and assert that its price overrides RAG context.
3. **Intent Dropping**: Assert that comments classified as SPAM do not trigger TTS.
4. **Tenant Isolation**: Assert Company A's session cannot retrieve Company B's context.

## 14. Exact Implementation Scope
For Phase 1D-7F Implementation, we will strictly touch:
1. **`backend/live_sessions/orchestrator.py`**:
   - Inject `LiveContextService` to read/write a sliding window of recent conversation history.
   - Inject `Product Truth` (Real-time price & stock of `session.product`) directly into the System Prompt.
   - Modify the output handling to respect intent/action rules (e.g., dropping empty replies).
2. **`backend/live_sessions/services.py`**:
   - Helper methods to format sliding window context into OpenAI `messages` format.
3. **`backend/live_sessions/tests_orchestrator.py`**:
   - Add unit tests for Context Window, Product Truth injection, and Intent routing.

We will **NOT**:
- Modify `ai_agents/services.py` (AI Core).
- Modify `ai_agents/rag_processor.py` (RAG).
- Rebuild TTS or Polling.
