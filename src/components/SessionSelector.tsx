import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';
import type { SessionSummary } from '../utils/session-store.js';

interface SessionSelectorProps {
  readonly sessions: ReadonlyArray<SessionSummary>;
  readonly onSelect: (sessionId: string | null) => void;
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${hours}:${minutes}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

export function SessionSelector({ sessions, onSelect }: SessionSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (sessions.length === 0) {
      if (key.escape) onSelect(null);
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(sessions[selectedIndex].id);
    } else if (key.escape) {
      onSelect(null);
    }
  });

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.primary} bold>Resume a previous session</Text>
        <Text color={colors.muted}>No previous sessions found.</Text>
        <Box marginTop={1}>
          <Text color={colors.muted}>esc to go back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={colors.primary} bold>Resume a previous session</Text>
      <Text color={colors.muted}>Select a session to continue, or esc to cancel.</Text>
      <Box marginTop={1} flexDirection="column">
        {sessions.map((s, idx) => {
          const isSelected = idx === selectedIndex;
          const prefix = isSelected ? '> ' : '  ';
          const turns = s.turnCount === 1 ? '1 turn' : `${s.turnCount} turns`;

          return (
            <Text
              key={s.id}
              color={isSelected ? colors.primaryLight : colors.primary}
              bold={isSelected}
            >
              {prefix}
              {idx + 1}. {formatSessionDate(s.createdAt)} {'\u00b7'} {'\u201c'}{truncate(s.firstQuery, 30)}{'\u201d'} {'\u00b7'} {turns}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={colors.muted}>Enter to resume {'\u00b7'} esc to cancel</Text>
      </Box>
    </Box>
  );
}
