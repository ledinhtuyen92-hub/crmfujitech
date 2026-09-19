import React, { useState, useEffect, useRef } from 'react';
import { Input, InputNumber } from 'antd';

const { TextArea } = Input;

/**
 * DebouncedInput — Smooth typing without re-rendering the parent on every keystroke.
 *
 * Strategy:
 *  - Local state for INSTANT display (zero lag)
 *  - Calls parent onChange after 400ms idle (debounced) — captures VALUE, not the stale SyntheticEvent
 *  - onBlur: cancels timer and commits immediately → data is ALWAYS saved before form submit
 */
export function DebouncedInput({ value, onChange, onBlur: externalOnBlur, ...props }) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const timerRef = useRef(null);
  // Keep a ref so onBlur always has the latest value even if closure is stale
  const localValueRef = useRef(localValue);

  // Sync when parent changes value externally (e.g. loading saved data, selecting product from dropdown)
  useEffect(() => {
    const incoming = value ?? '';
    setLocalValue(incoming);
    localValueRef.current = incoming;
  }, [value]);

  const commitValue = (val) => {
    // Build a compatible synthetic-event-like object so callers using e.target.value still work
    onChange({ target: { value: val } });
  };

  const handleChange = (e) => {
    // Capture value NOW — before React recycles the synthetic event
    const newVal = e.target.value;
    setLocalValue(newVal);
    localValueRef.current = newVal;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commitValue(newVal), 400);
  };

  const handleBlur = (e) => {
    // Flush immediately so save button always gets latest value
    if (timerRef.current) clearTimeout(timerRef.current);
    commitValue(localValueRef.current);
    if (externalOnBlur) externalOnBlur(e);
  };

  return (
    <Input
      {...props}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

/**
 * DebouncedInputNumber — Same approach for numeric inputs.
 * InputNumber onChange gives the parsed number directly (not an event).
 */
export function DebouncedInputNumber({ value, onChange, onBlur: externalOnBlur, ...props }) {
  const [localValue, setLocalValue] = useState(value ?? 0);
  const timerRef = useRef(null);
  const localValueRef = useRef(localValue);

  useEffect(() => {
    const incoming = value ?? 0;
    setLocalValue(incoming);
    localValueRef.current = incoming;
  }, [value]);

  const handleChange = (newVal) => {
    setLocalValue(newVal);
    localValueRef.current = newVal;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(newVal), 400);
  };

  const handleBlur = (e) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange(localValueRef.current);
    if (externalOnBlur) externalOnBlur(e);
  };

  return (
    <InputNumber
      {...props}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

/**
 * DebouncedTextArea — For autoSize TextArea fields.
 * autoSize recalculates height on every render; using local state prevents
 * parent re-renders from triggering expensive height recalculations.
 */
export function DebouncedTextArea({ value, onChange, onBlur: externalOnBlur, ...props }) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const timerRef = useRef(null);
  const localValueRef = useRef(localValue);

  useEffect(() => {
    const incoming = value ?? '';
    setLocalValue(incoming);
    localValueRef.current = incoming;
  }, [value]);

  const handleChange = (e) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    localValueRef.current = newVal;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange({ target: { value: newVal } });
    }, 400);
  };

  const handleBlur = (e) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange({ target: { value: localValueRef.current } });
    if (externalOnBlur) externalOnBlur(e);
  };

  return (
    <TextArea
      {...props}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
