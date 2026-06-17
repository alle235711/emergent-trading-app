import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import AppShell from "./components/layout/AppShell";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { TradingProvider } from "./context/TradingContext";
import { HorizonProvider } from "./context/HorizonContext";
import { TickerProvider } from "./context/TickerContext";
import { MarketDataProvider } from "./context/MarketDataContext";
import { DemoModeProvider } from "./context/DemoModeContext";

// Auth (standalone, outside the shell)
import LoginPage from "./pages/LoginPage";

// Account pages (inside the shell)
import PortfolioPage from "./pages/PortfolioPage";
import SettingsPage from "./pages/SettingsPage";

// Quant model rooms (inside the shell)
import MasterDashboard from "./pages/quant/MasterDashboard";
import SwdaSupportsPage from "./pages/quant/SwdaSupportsPage";
import SupportMatrixPage from "./pages/quant/SupportMatrixPage";
import EnsembleSdeForecastPage from "./pages/quant/EnsembleSdeForecastPage";
import AlertEnginePage from "./pages/quant/AlertEnginePage";
import TopologicalNeighborhoodsPage from "./pages/quant/TopologicalNeighborhoodsPage";
import PdeSurfacePage from "./pages/quant/PdeSurfacePage";
import RegimeDetectionPage from "./pages/quant/RegimeDetectionPage";

// Geometry, Topology & Algebra rooms — R&D (Models 9–13)
import CliqueHomologyPage from "./pages/quant/CliqueHomologyPage";
import SheafCohomologyPage from "./pages/quant/SheafCohomologyPage";
import AffineSchemePage from "./pages/quant/AffineSchemePage";
import HodgeDecompositionPage from "./pages/quant/HodgeDecompositionPage";
import QuantumGraphSpectrumPage from "./pages/quant/QuantumGraphSpectrumPage";
import BacktestPage from "./pages/quant/BacktestPage";
import ConvergencePage from "./pages/quant/ConvergencePage";
import JournalPage from "./pages/JournalPage";

/**
 * Application root.
 *
 * Routing model:
 *   • /login                     → standalone auth screen
 *   • everything else            → rendered inside <AppShell /> (fixed sidebar
 *                                   + contextual topbar via <Outlet />)
 *
 * The 8 quant rooms are the core deliverable; portfolio + settings live under
 * the "Account" section of the sidebar. Routes mirror src/config/navigation.js.
 */
function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <AuthProvider>
                    <TradingProvider>
                        <HorizonProvider>
                        <TickerProvider>
                        <MarketDataProvider>
                        <DemoModeProvider>
                        <Routes>
                            {/* Standalone */}
                            <Route path="/login" element={<LoginPage />} />

                            {/* Shell layout with nested model rooms */}
                            <Route element={<AppShell />}>
                                {/* Command */}
                                <Route index element={<MasterDashboard />} />

                                {/* Operational models */}
                                <Route path="/swda-supports" element={<SwdaSupportsPage />} />
                                <Route path="/support-matrix" element={<SupportMatrixPage />} />
                                <Route path="/sde-forecast" element={<EnsembleSdeForecastPage />} />
                                <Route path="/alert-engine" element={<AlertEnginePage />} />
                                <Route path="/backtest" element={<BacktestPage />} />
                                <Route path="/convergence" element={<ConvergencePage />} />

                                {/* Topology & PDE — R&D */}
                                <Route
                                    path="/topological-neighborhoods"
                                    element={<TopologicalNeighborhoodsPage />}
                                />
                                <Route path="/pde-surface" element={<PdeSurfacePage />} />
                                <Route path="/regime-detection" element={<RegimeDetectionPage />} />

                                {/* Geometry & Algebra — R&D (Models 9–13) */}
                                <Route path="/clique-homology" element={<CliqueHomologyPage />} />
                                <Route path="/sheaf-cohomology" element={<SheafCohomologyPage />} />
                                <Route path="/affine-scheme" element={<AffineSchemePage />} />
                                <Route path="/hodge-decomposition" element={<HodgeDecompositionPage />} />
                                <Route path="/quantum-graph-spectrum" element={<QuantumGraphSpectrumPage />} />

                                {/* Account */}
                                <Route path="/journal" element={<JournalPage />} />
                                <Route path="/portfolio" element={<PortfolioPage />} />
                                <Route
                                    path="/settings"
                                    element={
                                        <ProtectedRoute>
                                            <SettingsPage />
                                        </ProtectedRoute>
                                    }
                                />
                            </Route>

                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                        </DemoModeProvider>
                        </MarketDataProvider>
                        </TickerProvider>
                        </HorizonProvider>
                    </TradingProvider>
                </AuthProvider>
            </BrowserRouter>
            <Toaster
                theme="dark"
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: "#0A0F1C",
                        border: "1px solid #1B2335",
                        color: "#E6EAF2",
                        fontFamily: "JetBrains Mono, monospace",
                        borderRadius: 0,
                    },
                }}
            />
        </div>
    );
}

export default App;
