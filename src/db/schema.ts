import Dexie, { type Table } from 'dexie';

export interface Project {
  id?: number;
  name: string;
  genreProfileId: string;
  archived: boolean;
  createdAt: string;
}

export interface Turn {
  id?: number;
  projectId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

class NovelEngineDB extends Dexie {
  projects!: Table<Project, number>;
  turns!: Table<Turn, number>;

  constructor() {
    super('NovelEngineDB');
    this.version(1).stores({
      projects: '++id, name, createdAt, archived',
      turns: '++id, projectId, createdAt, role',
    });
  }
}

export const db = new NovelEngineDB();
