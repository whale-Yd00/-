import { useEffect, useMemo, useState } from 'react';
import { db, type Project, type ProviderProfile, type Turn } from './db/schema';

const DEFAULT_GENRE = 'lovecraftian_horror';

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    void bootstrap();
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

  const activeProvider = useMemo(() => providers.find((p) => p.isActive) ?? null, [providers]);

  async function bootstrap() {
    await ensureDefaultProvider();
    await Promise.all([refreshProjects(), refreshProviders()]);
  }

  async function ensureDefaultProvider() {
    const count = await db.providers.count();
    if (count > 0) return;
    await db.providers.add({
      name: 'Default OpenAI Compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelDefault: 'gpt-4.1',
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  }

  async function refreshProjects() {
    const rows = await db.projects.orderBy('createdAt').reverse().toArray();
    setProjects(rows);
    if (rows.length > 0 && activeProjectId === null) {
      setActiveProjectId(rows[0].id!);
    }
  }

  async function refreshProviders() {
    const rows = await db.providers.orderBy('createdAt').reverse().toArray();
    setProviders(rows);
  }

  async function switchProvider(providerId: number) {
    await db.transaction('rw', db.providers, db.projects, async () => {
      await db.providers.toCollection().modify({ isActive: false });
      await db.providers.update(providerId, { isActive: true, lastUsedAt: new Date().toISOString() });
      if (activeProjectId) {
        await db.projects.update(activeProjectId, { lastProviderId: providerId });
      }
    });
    await refreshProviders();
    await refreshProjects();
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
      lastProviderId: activeProvider?.id,
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
        content: `【占位回复】provider=${activeProvider?.name ?? 'N/A'}，已记录输入：${userContent}`,
        createdAt: new Date(Date.now() + 1).toISOString(),
      },
    ]);
    setInput('');
    await refreshTurns(activeProjectId);
  }

  async function exportStory() {
    if (!activeProjectId || !activeProject) return;
    downloadJson('story.json', {
      project: { id: activeProject.id, name: activeProject.name },
      chapters: [{ id: 'draft-1', turns }],
    });
  }

  async function exportLore() {
    if (!activeProject) return;
    downloadJson('lore.json', {
      project: { id: activeProject.id, name: activeProject.name, genreProfileId: activeProject.genreProfileId },
      providers: providers.map((p) => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, modelDefault: p.modelDefault })),
    });
  }

  async function exportSnapshot() {
    if (!activeProjectId || !activeProject) return;
    const projectTurns = await db.turns.where('projectId').equals(activeProjectId).sortBy('createdAt');
    downloadJson('project_snapshot.json', {
      exportedAt: new Date().toISOString(),
      project: activeProject,
      activeProvider,
      turns: projectTurns,
    });
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
        <header className="topbar">
          <h1>{activeProject?.name ?? '请先创建脚本'}</h1>
          <div className="topbar-actions">
            <select value={activeProvider?.id ?? ''} onChange={(e) => void switchProvider(Number(e.target.value))}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <button onClick={exportStory}>导出 story.json</button>
            <button onClick={exportLore}>导出 lore.json</button>
            <button onClick={exportSnapshot}>导出 snapshot.json</button>
          </div>
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
