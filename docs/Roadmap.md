1. DONE - update debug algorithm testers to record and report processing / elapsed time up to ms accuracy.
2. DONE - clicking middle mouse button enable pan.
3. DONE - Add new node window is cluttered , redesign and define a standard project template to follow. should be flexible to different screen sizes and devices. also window popup was instant no popup or popout animations,fix.
4. DONE - selecting tool should change mouse icon appropiatly between : Select, Add Node, Connect, and pan.
5. DONE - Network save function is not clear, is it automatically saved to server state ? or do I need to click save every time? perhaps make it clear by provide auto save checkbox?
6. DONE - export and import network functions is not working.
7. DONE - clicking on an empty space should de select node/connection/edge.
8. DONE - enable multi element selection (nodes,edges,...etc). in order to move,delete,...etc multiple elements together.
9. DONE - update path finding algorithms to consider several constraints provided b user : distance, cost, weight, avoid node / edge (blocking and best-effort options).
10. DONE - each node define number of available ports with (port name , port type (black and white (B/W) 1310nm or colored/DWDM line port 1550nm), port data rate, number of optical/DWDM channels, usage status). when creating edges you need to link two ports to each other (1 from each edge node) making that port status used. available ports are needed from both sides to make an edge between nodes. each node should have an appropriate default configuration and adjustable on creation window and configurable later. ports with type B/W can only support 1 ch and an edge with distance up to 10 km only. ports with DWDM type can support upto 96 channels and can be connected with edges of distance up to 150 km.
    **Note:** Port configuration implemented. Multi-select crash bug tracked in [docs/KNOWN\_ISSUES.md](./KNOWN_ISSUES.md).
11. DONE - edges should have different configurable parameter profiles for now define 1 profile : ITU.G652d fiber with attenuation parameter of 0.25 dB per km. add other useful fiber parameters as well like Chromatic dispersion (CD) and Polarization Dispersion (PD), non linear effects (they should have no impact now but could be useful in future). also store list of applicable SRLG# codes which defines OSP shared edges.
12. DONE - Node ports and edges should store the exact DWDM lambda or Ch# used and free for many calculations. this should be represent with actual ITU standard spectrum of channels supporting both fixed width channels (50GHz and multiples , or Flex-Grid 12.5 GHz or multiple channel width)
13. DONE - add OSP termination node to create breakpoints or fiber sections with different profiles, attenuations.
14. DONE - Let us work on next major update related to Service Management , reference the design.md document for details, always talk interactively with user and ask for clarification to have a clear implementation goal/plan.
15. DONE - Feature 2: Service Management
16. DONE - Table view with filtering and sorting
17. DONE - Service wizard for step-by-step creation
18. DONE - Path definition : manual, Automatic path computation (using multiple defined algorithms like :shortest path, k-shortest path, edge-disjoint, multiple other consideration like : distance, cost, weight, avoid node / edge)
19. DONE - Layer 1 Service (optical / DWDM) : require availbel physical connection between source and destination. it also requires an available non reserved lambda/ ch along an entire e2e path from source destination (exact same CH#). it should include many configurable parameters like : Data rate, baud-rate , modulation type, channel width, exact Ch#, path, WSON (1+R) Restoration, Protection (reference the protection service ID), see if protection path have any same SRLG# code of the main path (quantify shared distance in km and shared edge IDs). use OLP or SNCP or 1+1 protection/switch scheme.
20. DONE - Layer 2/3 (IP) Service : requires an available layer 1 (DWDM) service from source and destination with the required data rate. define protection path, identify and quantify any shared portions. define BFD and IP protection/switch scheme
21. DONE - Visual path highlighting on canvas (working path: solid blue, protection path: dashed green)
22. DONE - Capacity validation before service creation
23. PLANNED - Phase 7: Advanced SRLG Management
    - SRLG with distance pairing: Associate each SRLG code with a distance value (in km) representing the portion of the edge covered by that SRLG
    - Partial SRLG sharing calculation: When analyzing path diversity, calculate actual shared distance in km (not just edge overlap)
    - Example: Edge A-B (100km) has SRLG-001 covering first 30km, SRLG-002 covering remaining 70km. If working path uses full edge and protection path shares SRLG-001 on another edge, shared risk = 30km not 100km
    - SRLG editor UI for defining and managing SRLG codes with distance ranges
    - Enhanced SRLG analysis in service creation wizard showing precise shared distance metrics
24. DONE - Service Validation Test Suite
25. DONE - UI Enhancements v2
    - Dark mode support with theme toggle (light/dark/system)
    - Geographic view with Leaflet maps and CartoDB tiles
    - Location picker modal for setting node coordinates on map
    - Grid visibility toggle, size options (20/40/80px), and snap-to-grid
    - Delete confirmation modal with impact analysis
    - Node type icons (lucide-react) replacing text labels
    - In-app help documentation (WikiModal with 8 sections)
    - DropdownMenu UI component (Radix UI)
    - ServiceTester component in debug page
    - 12 validation tests: L1 (5), L2/L3 (4), Lifecycle (2), Integration (1)
    - Sample topology generators (basic-l1, protected-l1, l2-over-l1, multi-layer)
    - Test timing display with microsecond precision
