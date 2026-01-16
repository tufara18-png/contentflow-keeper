import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PinGate } from "@/components/PinGate";
import { BottomNav } from "@/components/BottomNav";
import CapturePage from "./pages/CapturePage";
import DashboardPage from "./pages/DashboardPage";
import FocusPage from "./pages/FocusPage";
import AllTasksPage from "./pages/AllTasksPage";
import CalendarPage from "./pages/CalendarPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PinGate>
        <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/capture" element={<CapturePage />} />
              <Route path="/focus" element={<FocusPage />} />
              <Route path="/tasks" element={<AllTasksPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <BottomNav />
          </div>
        </BrowserRouter>
      </PinGate>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
