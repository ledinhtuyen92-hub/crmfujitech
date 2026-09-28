import { useState, useEffect, useCallback, useRef } from 'react';

export const useLiveWebSocket = (sessionId) => {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);

  const connect = useCallback(() => {
    if (!sessionId) return;
    
    // Prevent duplicate connections
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError(new Error('No access token available'));
      return;
    }

    // Determine WebSocket protocol based on HTTP protocol
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Use VITE_API_URL if available, otherwise construct from current location
    let host = '';
    const envApiUrl = import.meta.env.VITE_API_URL;
    if (envApiUrl) {
      const url = new URL(envApiUrl);
      host = url.host;
    } else {
      host = 'localhost:8000';
    }

    const wsUrl = `${wsProtocol}//${host}/ws/live_sessions/${sessionId}/admin/?token=${token}`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent(data);
          setEvents(prev => [...prev, data]);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (evt) => {
        setError(new Error('WebSocket connection error'));
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
      };
    } catch (err) {
      setError(err);
      setConnected(false);
    }
  }, [sessionId]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => {
      connect();
    }, 500);
  }, [connect, disconnect]);

  useEffect(() => {
    if (sessionId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect]);

  return {
    connected,
    events,
    lastEvent,
    error,
    reconnect,
    disconnect
  };
};
