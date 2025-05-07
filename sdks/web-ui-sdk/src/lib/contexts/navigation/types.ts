import { TSteps } from '../configuration/types';

export interface IStep {
  name: TSteps;
  component: typeof import('svelte').SvelteComponent;
  type?: string;
}
