#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Implement the Topological Data Analysis (TDA) front-end:
    * Hero animation with a Mapper force-directed graph on the landing page
    * New dedicated route /topological-analysis with Trader ↔ Quant complexity toggle
    * Panel A: FNN (Kennel) + Cao E* charts + interpretation card
    * Panel B: Interactive Mapper graph with on-hover tooltip (volatility, #points)
    * Panel C: Price chart with sparse-regime overlay + GBM fan chart (mean / q05 / q95)
    * Wire frontend to /api/tda/fnn, /api/tda/mapper, /api/tda/full
    * Skeleton loaders + mock fallback when backend is unreachable
    * Match the existing dark "quant terminal" aesthetic

frontend:
  - task: "API client - TDA endpoints"
    implemented: true
    working: "NA"
    file: "frontend/src/lib/api.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added fetchTdaFnn / fetchTdaMapper / fetchTdaFull with 120s timeout."

  - task: "Mock state for TDA"
    implemented: true
    working: true
    file: "frontend/src/lib/tdaMock.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Generates seeded synthetic FNN / Mapper / topology series + GBM cone. Verified rendering."

  - task: "Topological Analysis View (Trader/Quant toggle, 3 panels)"
    implemented: true
    working: true
    file: "frontend/src/components/quant/TopologicalAnalysisView.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Verified via screenshots in both Trader and Quant modes. Mock banner shown when live endpoints fail (502 from yfinance in sandbox)."

  - task: "Mapper Force-Directed Graph"
    implemented: true
    working: true
    file: "frontend/src/components/quant/tda/MapperGraph.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "react-force-graph-2d with volatility color scale, hover tooltip (#points, σ), zoom/pan, ambient mode for hero."

  - task: "FNN / Cao charts (Recharts)"
    implemented: true
    working: true
    file: "frontend/src/components/quant/tda/FnnCharts.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Two side-by-side LineCharts with d* reference line. Verified."

  - task: "GBM Fan Chart with regime overlay"
    implemented: true
    working: true
    file: "frontend/src/components/quant/tda/GbmFanChart.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "ComposedChart with ReferenceArea for regimes, stacked Area for q05-q95 cone, mean dashed line. Verified."

  - task: "Routing + Header nav (/topological-analysis)"
    implemented: true
    working: true
    file: "frontend/src/App.js, frontend/src/components/layout/AppHeader.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Route registered, 'Topology' nav link with BrainCircuit icon visible in header (active state styled)."

  - task: "Dashboard Hero with ambient Mapper graph"
    implemented: true
    working: true
    file: "frontend/src/components/quant/tda/DashboardHero.jsx, frontend/src/pages/Dashboard.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Animated colored nodes floating behind hero text with CTA to /topological-analysis. Verified."

metadata:
  created_by: main_agent
  version: "1.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Topological Analysis View (Trader/Quant toggle, 3 panels)"
    - "Mapper Force-Directed Graph"
    - "GBM Fan Chart with regime overlay"
    - "Routing + Header nav (/topological-analysis)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: main
    message: |
      Front-end TDA feature complete. Installed react-force-graph-2d.
      Live backend endpoints currently return 502 in this sandbox because
      yfinance cannot reach external network — the UI falls back to seeded
      mock data automatically (orange mock_mode banner shown).
      All routes / panels / toggles render correctly under both Trader and
      Quant complexity modes (verified via screenshots).
      No backend changes were made.