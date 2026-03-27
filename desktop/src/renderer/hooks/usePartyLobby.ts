import { useEffect, useRef, useCallback } from 'react';
import { useGameDispatch } from '../state/game-context';
import { PartyClient } from '../game/party-client';

export function usePartyLobby() {
  const dispatch = useGameDispatch();
  const clientRef = useRef<PartyClient | null>(null);

  // Initialize: get GitHub auth, connect to lobby
  useEffect(() => {
    let cancelled = false;
    const w = window as any;

    w.claude?.getGitHubAuth?.()
      .then((auth: { username: string } | null) => {
        if (cancelled) return;
        if (!auth) {
          dispatch({ type: 'PARTY_ERROR', message: 'GitHub CLI not authenticated. Run: gh auth login' });
          return;
        }

        const client = new PartyClient({
          room: 'global-lobby',
          username: auth.username,
          onMessage: (data) => {
            switch (data.type) {
              case 'presence':
                dispatch({ type: 'PRESENCE_UPDATE', online: data.users });
                break;
              case 'user-joined':
                dispatch({ type: 'USER_JOINED', username: data.username, status: data.status });
                break;
              case 'user-left':
                dispatch({ type: 'USER_LEFT', username: data.username });
                break;
              case 'user-status':
                dispatch({ type: 'USER_STATUS', username: data.username, status: data.status });
                break;
              case 'challenge':
                dispatch({ type: 'CHALLENGE_RECEIVED', from: data.from, code: data.code });
                break;
              case 'challenge-response':
                if (!data.accept) {
                  dispatch({ type: 'CHALLENGE_DECLINED', by: data.from });
                }
                break;
            }
          },
          onOpen: () => {
            dispatch({ type: 'PARTY_CONNECTED', username: auth.username });
          },
          onClose: () => {
            dispatch({ type: 'PARTY_DISCONNECTED' });
          },
          onError: () => {
            dispatch({ type: 'PARTY_ERROR', message: 'Lost connection to game server' });
          },
        });

        clientRef.current = client;
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'PARTY_ERROR', message: 'Failed to get GitHub auth' });
        }
      });

    return () => {
      cancelled = true;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [dispatch]);

  const updateStatus = useCallback((status: 'idle' | 'in-game') => {
    clientRef.current?.send({ type: 'status', status });
  }, []);

  const challengePlayer = useCallback((target: string, gameType: string, code: string) => {
    clientRef.current?.send({ type: 'challenge', target, gameType, code });
  }, []);

  const respondToChallenge = useCallback((from: string, accept: boolean) => {
    clientRef.current?.send({ type: 'challenge-response', from, accept });
  }, []);

  return { updateStatus, challengePlayer, respondToChallenge };
}
