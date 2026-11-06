import { createContext, useContext } from 'react';
import type { SimulationLog } from '@/engine/simulator';
import type { ChronoState } from '@/engine/types';
import type { BranchRow, SimulationRow } from '@/lib/chronoRepository';
import type { LogAnalysis } from '@/lib/engineApi';

export interface SimulationContextValue {
  simulation: SimulationRow;
  branches: BranchRow[];
  activeBranch: BranchRow;
  log: SimulationLog;
  analysis: LogAnalysis;
  setActiveBranchId: (id: string) => void;
  refresh: () => Promise<void>;
  /** Global playback clock shared by the scrubber and every workspace page. */
  time: number;
  endTime: number;
  setTime: (time: number) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  /** Kernel state reconstructed at `time`. */
  state: ChronoState;
  stateLoading: boolean;
}

export const SimulationContext = createContext<SimulationContextValue | null>(null);

export function useSimulation(): SimulationContextValue {
  const value = useContext(SimulationContext);
  if (!value) throw new Error('useSimulation must be used inside a simulation page');
  return value;
}
