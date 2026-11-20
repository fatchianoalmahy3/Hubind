import type { MonitoringStageControl } from '../src/core/types/schema';

export interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
  apiKey: string;
}

export interface WorkspaceConfig {
  activeYear: string;
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string;
  driveFolderUrl: string;
  gasDeployUrl: string;
  academicYears: any[];
  templates: any[];
  monitoringStageControl: MonitoringStageControl;
}

export type GasWriteAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BULK_DELETE'
  | 'BULK_UPDATE'
  | 'IMPORT'
  | 'SYNC_ALL';

export interface AdminSessionPayload {
  id: string;
  username: string;
  role: string;
  name: string;
  exp: number;
}

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  role: string;
  name: string;
}

export interface ServerAdminAccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  namaLengkap: string;
  jabatan: string;
  status: 'Aktif' | 'Nonaktif';
  updatedAt: string;
  isDefaultSeed: boolean;
}

export class PortalConfigError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
