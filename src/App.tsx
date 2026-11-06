import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import DashboardPage from '@/pages/DashboardPage';
import NewSimulationPage from '@/pages/NewSimulationPage';
import SimulationLayout from '@/pages/SimulationLayout';
import OverviewPage from '@/pages/simulation/OverviewPage';
import CpuPage from '@/pages/simulation/CpuPage';
import { DiskPage, MemoryPage, ResourcesPage } from '@/pages/simulation/ResourcePages';
import TimeMachinePage from '@/pages/simulation/TimeMachinePage';
import BranchesPage from '@/pages/simulation/BranchesPage';
import { EventsPage, ForensicsPage } from '@/pages/simulation/ForensicsAndEvents';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen text-slate-100 antialiased">
        <Routes>
          <Route
            path="/"
            element={
              <AppShell>
                <DashboardPage />
              </AppShell>
            }
          />
          <Route
            path="/new"
            element={
              <AppShell>
                <NewSimulationPage />
              </AppShell>
            }
          />
          <Route path="/simulations/:simId" element={<SimulationLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="cpu" element={<CpuPage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="disk" element={<DiskPage />} />
            <Route path="resources" element={<ResourcesPage />} />
            <Route path="time" element={<TimeMachinePage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="forensics" element={<ForensicsPage />} />
            <Route path="events" element={<EventsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
