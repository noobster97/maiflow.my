import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export interface Project {
  id: number;
  name: string;
  base_url: string;
  description: string;
  schedule: string | null;
  headless: number; // 0 or 1
  timeout_ms: number;
  webhook_url: string | null;
  env_vars: string; // JSON string
  created_at: string;
  // health stats (from list endpoint)
  total_flows?: number;
  passing_flows?: number;
  failing_flows?: number;
  last_run_at?: string | null;
}

export interface StepAction {
  action: string;
  [key: string]: any;
}

export interface Flow {
  id: number;
  project_id: number;
  name: string;
  steps: StepAction[];
  type: 'manual' | 'recorded';
  script: string | null;
  retry_on_failure: number; // 0 or 1 (SQLite boolean)
  created_at: string;
}

export interface Run {
  id: number;
  flow_id: number;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error_message: string | null;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  current_step: string | null;
  live_screenshot: string | null;
  created_at: string;
  flow_name?: string;
  project_name?: string;
}

export interface Screenshot {
  id: number;
  run_id: number;
  filename: string;
  label: string;
  created_at: string;
}

export const projectsApi = {
  list: () => api.get<Project[]>('/projects').then(r => r.data),
  get: (id: number) => api.get<Project>(`/projects/${id}`).then(r => r.data),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data).then(r => r.data),
  update: (id: number, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/projects/${id}`).then(r => r.data),
  clearRuns: (id: number) => api.delete<{ deleted_runs: number; deleted_screenshots: number }>(`/projects/${id}/runs`).then(r => r.data),
  clearFlows: (id: number) => api.delete<{ deleted_flows: number; deleted_runs: number; deleted_screenshots: number }>(`/projects/${id}/flows`).then(r => r.data),
};

export const flowsApi = {
  listByProject: (projectId: number) => api.get<Flow[]>(`/flows/project/${projectId}`).then(r => r.data),
  listByProjectWithRuns: (projectId: number) => api.get<(Flow & { runs: Run[] })[]>(`/flows/project/${projectId}/with-runs`).then(r => r.data),
  get: (id: number) => api.get<Flow>(`/flows/${id}`).then(r => r.data),
  create: (data: Partial<Flow>) => api.post<Flow>('/flows', data).then(r => r.data),
  update: (id: number, data: Partial<Flow>) => api.put<Flow>(`/flows/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/flows/${id}`).then(r => r.data),
  import: (projectId: number, flows: any[]) => api.post<{ created: number }>(`/flows/import/${projectId}`, flows).then(r => r.data),
  reorder: (projectId: number, updates: { id: number; order_index: number }[]) => api.put(`/flows/project/${projectId}/reorder`, updates).then(r => r.data),
  clone: (id: number) => api.post<Flow>(`/flows/${id}/clone`).then(r => r.data),
  templateUrl: () => `/api/flows/template`,
};

export const recorderApi = {
  start: (base_url: string) => api.post<{ session_id: string }>('/recorder/start', { base_url }).then(r => r.data),
  stop: (sessionId: string) => api.post<{ script: string }>(`/recorder/stop/${sessionId}`).then(r => r.data),
  status: (sessionId: string) => api.get<{ active: boolean }>(`/recorder/status/${sessionId}`).then(r => r.data),
};

export const runsApi = {
  listByFlow: (flowId: number) => api.get<Run[]>(`/runs/flow/${flowId}`).then(r => r.data),
  get: (id: number) => api.get<Run & { screenshots: Screenshot[] }>(`/runs/${id}`).then(r => r.data),
  trigger: (flowId: number) => api.post<{ run_id: number }>(`/runs/flow/${flowId}/run`).then(r => r.data),
  cancel: (id: number) => api.post(`/runs/${id}/cancel`).then(r => r.data),
  runAll: (projectId: number) => api.post<{ message: string; run_ids: number[] }>(`/runs/project/${projectId}/run-all`).then(r => r.data),
  runFailed: (projectId: number) => api.post<{ message: string; run_ids: number[] }>(`/runs/project/${projectId}/run-failed`).then(r => r.data),
  stopAll: (projectId: number) => api.post(`/runs/project/${projectId}/stop-all`).then(r => r.data),
  recent: (limit?: number) => api.get<Run[]>(`/runs/recent/${limit || 20}`).then(r => r.data),
};
