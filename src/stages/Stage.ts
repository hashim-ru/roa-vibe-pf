import { World } from '../physics/World';

export interface StageDef {
  id: string;
  build(): World;
}
