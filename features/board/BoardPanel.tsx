'use client';

// 전 팀 공유 게시판 — 보기·댓글은 모두, 글쓰기는 팀장급 이상.
//   예배준비(새신자·긴급·준비항목)를 카테고리로 담는다.

import { useCallback, useEffect, useState } from 'react';

const CATEGORIES = ['일반', '새신자', '긴급', '준비항목'] as const;
type Category = (typeof CATEGORIES)[number];

interface Post {
  id: string;
  created_at: string;
  author_name: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  comment_count: number;
}
interface Comment {
  id: string;
  created_at: string;
  author_name: string;
  body: string;
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function BoardPanel() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [filter, setFilter] = useState<'' | Category>('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState({ category: '일반' as Category, title: '', body: '' });
  const [posting, setPosting] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commenting, setCommenting] = useState(false);

  const loadPosts = useCallback(async (category: '' | Category) => {
    setStatus('loading');
    try {
      const query = category ? `?category=${encodeURIComponent(category)}` : '';
      const res = await fetch(`/api/board${query}`);
      const json = await res.json() as { ok?: boolean; posts?: Post[]; canPost?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message ?? '게시글을 불러오지 못했습니다.');
      setPosts(json.posts ?? []);
      setCanPost(Boolean(json.canPost));
      setStatus('done');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { void loadPosts(filter); }, [filter, loadPosts]);

  const loadComments = useCallback(async (postId: string) => {
    setComments([]);
    try {
      const res = await fetch(`/api/board/comments?postId=${postId}`);
      const json = await res.json() as { ok?: boolean; comments?: Comment[] };
      if (json.ok) setComments(json.comments ?? []);
    } catch { /* 조용히 — 화면이 막히지 않게 */ }
  }, []);

  const toggleOpen = (postId: string) => {
    if (openId === postId) { setOpenId(null); return; }
    setOpenId(postId);
    setCommentBody('');
    void loadComments(postId);
  };

  const submitPost = async () => {
    if (!draft.title.trim() || posting) return;
    setPosting(true);
    setMessage('');
    try {
      const res = await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json() as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message ?? '글을 저장하지 못했습니다.');
      setDraft({ category: '일반', title: '', body: '' });
      setComposeOpen(false);
      await loadPosts(filter);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '글을 저장하지 못했습니다.');
    } finally {
      setPosting(false);
    }
  };

  const submitComment = async (postId: string) => {
    if (!commentBody.trim() || commenting) return;
    setCommenting(true);
    try {
      const res = await fetch('/api/board/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, body: commentBody.trim() }),
      });
      const json = await res.json() as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message ?? '댓글을 저장하지 못했습니다.');
      setCommentBody('');
      await loadComments(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '댓글을 저장하지 못했습니다.');
    } finally {
      setCommenting(false);
    }
  };

  return (
    <main className="site-shell">
      <section className="panel search-panel">
        <div className="board-filter">
          <button type="button" className={`board-chip ${filter === '' ? 'active' : ''}`} onClick={() => setFilter('')}>전체</button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`board-chip ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>{c}</button>
          ))}
          {canPost && (
            <button type="button" className="board-chip write" onClick={() => setComposeOpen((v) => !v)}>
              {composeOpen ? '닫기' : '+ 글쓰기'}
            </button>
          )}
        </div>

        {composeOpen && canPost && (
          <div className="board-compose">
            <div className="field-grid two-columns">
              <label>분류
                <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as Category }))}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>제목
                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="제목" />
              </label>
            </div>
            <label>내용
              <textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} placeholder="내용 (선택)" rows={5} />
            </label>
            <button type="button" className="primary-button" onClick={() => void submitPost()} disabled={!draft.title.trim() || posting}>
              {posting ? '올리는 중...' : '등록'}
            </button>
          </div>
        )}

        {message && <p className="search-message error">{message}</p>}
        {status === 'loading' && <p className="search-message loading">불러오는 중...</p>}
      </section>

      {status === 'done' && posts.length === 0 && (
        <section className="panel"><div className="empty-state"><div className="empty-icon">📝</div><p>아직 글이 없습니다.</p></div></section>
      )}

      {posts.map((post) => (
        <section className="panel board-post" key={post.id}>
          <button type="button" className="board-post-head" onClick={() => toggleOpen(post.id)}>
            <div className="board-post-title">
              {post.pinned && <span className="board-pin">고정</span>}
              <span className={`board-cat cat-${post.category}`}>{post.category}</span>
              <strong>{post.title}</strong>
            </div>
            <span className="board-post-meta">{post.author_name || '익명'} · {when(post.created_at)} · 💬 {post.comment_count}</span>
          </button>

          {openId === post.id && (
            <div className="board-post-body">
              {post.body && <pre className="bc-pre">{post.body}</pre>}
              <div className="board-comments">
                {comments.map((c) => (
                  <div className="board-comment" key={c.id}>
                    <p className="board-comment-meta">{c.author_name || '익명'} · {when(c.created_at)}</p>
                    <p className="board-comment-body">{c.body}</p>
                  </div>
                ))}
                <div className="board-comment-form">
                  <input
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void submitComment(post.id); }}
                    placeholder="댓글 달기"
                  />
                  <button type="button" className="secondary-button" onClick={() => void submitComment(post.id)} disabled={!commentBody.trim() || commenting}>
                    {commenting ? '...' : '등록'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
