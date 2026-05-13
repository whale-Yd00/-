import Dexie, { type Table } from 'dexie';

export interface Project {
  id?: number;
  name: string;
  genreProfileId: string;
  archived: boolean;
  createdAt: string;
  lastProviderId?: number;
}

export interface Turn {
  id?: number;
  projectId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface ProviderProfile {
  id?: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  modelDefault: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

class NovelEngineDB extends Dexie {
  projects!: Table<Project, number>;
  turns!: Table<Turn, number>;
  providers!: Table<ProviderProfile, number>;

  constructor() {
    super('NovelEngineDB');
    this.version(1).stores({
      projects: '++id, name, createdAt, archived',
      turns: '++id, projectId, createdAt, role',
    });
    this.version(2).stores({
      projects: '++id, name, createdAt, archived, lastProviderId',
      turns: '++id, projectId, createdAt, role',
      providers: '++id, name, isActive, createdAt, lastUsedAt',
    });
  }
}

export const db = new NovelEngineDB();
