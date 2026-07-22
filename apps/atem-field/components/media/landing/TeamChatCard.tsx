'use client';

/**
 * TeamChatCard — 실시간 팀 채팅 (Phase 2A는 로컬 목)
 */

import { useState, useRef, useEffect } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { Avatar, Card, formatRelative, SectionLink } from './_shared';

export default function TeamChatCard() {
  const messages = useMediaStore((s) => s.chatMessages);
  const members = useMediaStore((s) => s.members);
  const currentMember = useMediaStore((s) => s.getCurrentMember());
  const sendChatMessage = useMediaStore((s) => s.sendChatMessage);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    sendChatMessage(trimmed);
    setDraft('');
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card
      title="팀 채팅"
      hint="# general 채널"
      action={<SectionLink href="/media/team/chat">확장 →</SectionLink>}
      padded={false}
    >
      <div className="flex flex-col h-full">
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3"
          style={{ maxHeight: 260 }}
        >
          {messages.map((msg) => {
            if (msg.system) {
              return (
                <div key={msg.id} className="text-center">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-[10px] text-violet-700">
                    {msg.body}
                  </span>
                </div>
              );
            }
            const author = members.find((m) => m.id === msg.authorId);
            const isMe = currentMember?.id === msg.authorId;
            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}
              >
                <Avatar name={author?.name ?? '?'} size={26} />
                <div className={`max-w-[75%] ${isMe ? 'text-right' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-gray-700">
                      {author?.name ?? '알 수 없음'}
                    </span>
                    <span className="text-[9px] text-gray-400">
                      {formatRelative(msg.createdAt)}
                    </span>
                  </div>
                  <div
                    className={`mt-0.5 inline-block px-3 py-1.5 rounded-2xl text-[11px] leading-relaxed ${
                      isMe
                        ? 'bg-violet-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 입력 */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder="메시지를 입력하세요..."
              className="flex-1 h-9 px-3 rounded-lg bg-white border border-gray-200 text-[12px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim()}
              className="px-3 h-9 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-gray-300 text-white text-[11px] font-semibold transition-colors"
            >
              보내기
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
