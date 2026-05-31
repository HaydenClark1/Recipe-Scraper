## Codebase Context

This project uses Xanther Context Engine (XCE) via MCP for codebase understanding.

Always use xanther-xce MCP tools before reading files:
- Call `xce_get_context` first on any task — it returns architecture, code locations, and relationships
- Use `xce_architecture_context` before modifying any file
- Use `xce_impact_analysis` before multi-file changes
- Use `xce_search` to find code by meaning instead of grep
- Use `xce_trace` to understand how code connects to the broader architecture

XCE provides HLD (high-level design), LLD (low-level design), call graphs, and component descriptions. This is faster and more accurate than reading files individually.