export type StepAction =
  | { action: 'navigate'; url: string }
  | { action: 'click'; selector: string }
  | { action: 'fill'; selector: string; value: string }
  | { action: 'select'; selector: string; value: string }
  | { action: 'wait'; ms: number }
  | { action: 'assert_url'; contains: string }
  | { action: 'assert_element'; selector: string }
  | { action: 'assert_text'; selector: string; contains: string }
  | { action: 'screenshot'; name: string };

export interface Project {
  id: number;
  name: string;
  base_url: string;
  description: string;
  created_at: string;
}

export interface Flow {
  id: number;
  project_id: number;
  name: string;
  steps: StepAction[];
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
  created_at: string;
}
