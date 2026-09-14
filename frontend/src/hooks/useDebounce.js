/**
 * useDebounce — Custom hook for smooth server-side search UX
 *
 * Pattern: input updates immediately (responsive feel), API fires after delay
 *
 * Usage:
 *   const [inputVal, searchQuery, handleChange] = useDebounce('', 400)
 *   // inputVal  → bind to <Input value={inputVal} onChange={handleChange} />
 *   // searchQuery → use in useEffect/fetch (changes only after debounce delay)
 */
import { useState, useRef, useCallback } from 'react'

/**
 * @param {string} initialValue
 * @param {number} delay  ms to wait after last keystroke before updating searchQuery (default 400)
 * @returns {[string, string, function, function]}
 *   [inputValue, debouncedQuery, handleChange, resetSearch]
 */
export function useDebounce(initialValue = '', delay = 400) {
  const [inputValue, setInputValue] = useState(initialValue)
  const [debouncedQuery, setDebouncedQuery] = useState(initialValue)
  const timerRef = useRef(null)

  const handleChange = useCallback((e) => {
    // Support both React SyntheticEvent (e.target.value) and raw string values
    const val = typeof e === 'string' ? e : (e?.target?.value ?? '')
    setInputValue(val)           // immediate — input feels snappy
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(val)     // delayed — triggers API call
    }, delay)
  }, [delay])

  const resetSearch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setInputValue(initialValue)
    setDebouncedQuery(initialValue)
  }, [initialValue])

  return [inputValue, debouncedQuery, handleChange, resetSearch]
}

export default useDebounce
