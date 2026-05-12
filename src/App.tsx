import { useEffect, useMemo, useState } from 'react';
import { db, type Project, type Turn } from './db/schema';

const DEFAULT_GENRE = 'lovecraftian_horror';

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    if (activeProjectId !== null) {
      void refreshTurns(activeProjectId);
    }
  }, [activeProjectId]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  async function refreshProjects() {
    const rows = await db.projects.orderBy('createdAt').reverse().toArray();
    setProjects(rows);
    if (rows.length > 0 && activeProjectId === null) {
      setActiveProjectId(rows[0].id!);
    }
  }

  async function refreshTurns(projectId: number) {
    const rows = await db.turns.where('projectId').equals(projectId).sortBy('createdAt');
    setTurns(rows);
  }

  async function createProject() {
    const name = `新脚本 ${projects.length + 1}`;
    const id = await db.projects.add({
      name,
      genreProfileId: DEFAULT_GENRE,
      archived: false,
      createdAt: new Date().toISOString(),
    });
    await refreshProjects();
    setActiveProjectId(id);
  }

  async function submitTurn() {
    if (!activeProjectId || !input.trim()) return;
    const now = new Date().toISOString();
    const userContent = input.trim();
    await db.turns.bulkAdd([
      { projectId: activeProjectId, role: 'user', content: userContent, createdAt: now },
      {
        projectId: activeProjectId,
        role: 'assistant',
        content: `【占位回复】已记录输入：${userContent}`,
        createdAt: new Date(Date.now() + 1).toISOString(),
      },
    ]);
    setInput('');
    await refreshTurns(activeProjectId);
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Projects</h2>
        <button onClick={createProject}>+ 新建脚本</button>
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              <button className={p.id === activeProjectId ? 'active' : ''} onClick={() => setActiveProjectId(p.id!)}>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="chat">
        <header>
          <h1>{activeProject?.name ?? '请先创建脚本'}</h1>
        </header>
        <section className="messages">
          {turns.map((t) => (
            <article key={t.id} className={`msg ${t.role}`}>
              <strong>{t.role}</strong>
              <p>{t.content}</p>
            </article>
          ))}
        </section>
        <footer className="composer">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入剧情推进或 leader 指令..." />
          <button onClick={submitTurn}>发送</button>
        </footer>
      </main>
    </div>
  );
}
