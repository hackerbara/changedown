
**ChangeDown collaborative Editing Powered by CriticMarkup**

*By: Author 1, Product Lead – ChangeDown*

*Author 2, Engineering – ChangeDown*

*Author 3, Documentation – ChangeDown*

****

When teams collaborate on documents, they are not thinking about the underlying technology — they just want their edits tracked reliably and attributed correctly.

But  document editing workflows face a familiar challenge: you have invested in sophisticated AI agents that can draft, revise, and restructure content, yet they  every editorial safeguard your team depends on  —Edits arrive without attribution. Revisions overwrite previous work with no record. Reviewers discover changes only by diffing file versions after the fact,  reconstructing context from commit messages that rarely explain why a particular sentence was reworded or a paragraph reorganized.

That is why ChangeDown and the CriticMarkup open standard took a different approach. Every edit {--captured--}is  inline, attributed to its author, with a reason attached.

The new open source CriticMarkup connector for markdown editors gives teams a bring-your-own-vocabulary approach to change tracking. Rather than forcing a proprietary format, the connector maps every insertion, deletion, substitution highlightand comment to standard CriticMarkup delimiters that any text editor can render. This means organizations can integrate change tracking into their existing markdown pipelines without vendor lock-in, using the same files across VS Code, GitHub, static site generators, and documentation build systems that already process plain text natively while maintaining full editorial accountability.

For the more than 10,000 organizations running collaborative document workflows today, this integration delivers a practical path to tracked AI editing. Teams in North America, Europe, and the Asia-Pacific region can connect their existing markdown toolchains to ChangeDown without replacing their current editors or revision control systems.

Here is how the integration works, where it fits across collaborative editing workflows, and what measurable improvements organizations report from deploying tracked change management.

**ChangeDown integration architecture and design**

This integration connects your markdown editing environment to open-source CriticMarkup services through a layered architecture designed for extensibility and reliability. The architecture comprises three integrated layers:

  

- **Editor**  **interaction layer:** – The VS Code extension captures every keystroke and cursor movement, accumulating edits into boundary-delimited change operations that wrap automatically in CriticMarkup(CM) syntax before writing each attributed change to the file.
- **Connector layer:** – The open source MCP tool server bridges AI agents to the same CriticMarkup format, translating propose_change calls into attributed edit operations with full metadata.
- **AI agent** **layer** – Large language models and other AI agents interact with tracked files through the MCP tool server, generating context-aware edit proposals that reference LINE:HASH coordinates. The connector validates each proposal against the current file state before committing attributed changes to the CriticMarkup record using thesix-level matching cascade. Metadata extraction is handled by the footnote-native parser, delivering structured metadata extraction for attributed review responses.

This architecture is illustrated in the following NEEDS ACTION: replace with actual figure reference diagram.

![Diagram showing human and AI agent collaboration flow](_media/diagram-collaboration.png)

*Figure 1: ChangeDown extension integration with CriticMarkup services overview*

** Agent editing flow**

When an agent connects to a tracked file in the editing environment, the following flow takes place:

1. **Agent reads file state** – The agent reads the current file state through the MCP read_tracked_file tool, which returns every line with its LINE:HASH coordinate. The agent receives the full document context including pending changes, author metadata, and review status for each  tracked operation.
2. **Parser interprets intent** –  The CriticMarkup parser processes the request and identifies the appropriate editing action from the agent instructions through three stages:
   1. **Change Detection:** – supporting thousands {--concurrent--}of  editing sessions
   2. **Intent Understanding:** – attribution now enhanced with LLM-powered contextual intent classification for faster, description-based intent classification
   3. **Response Generation:** – For straightforward requests, the MCP tool server generates a direct response using its built-in propose_change fulfillment. For complex editing tasks requiring document context, the system routes to large language models (such as Claude) for nuanced revision proposals that respect existing tracked changes.

3. **Response flows back** –  The MCP tool server formulates the edit proposal and routes it through the CriticMarkup parser for validation and serialization. The response includes fully attributed change operations with LINE:HASH coordinates. The parser supports the six-level matching cascade for fine-grained control over anchor resolution, whitespace normalization, and settled-text fallback (STF) in ambiguous contexts. The response flows back through the connector to the editor using the CriticMarkup protocol.
4. **Escalation when needed** –  If the virtual agent can't resolve the editing request — for example, when a proposed substitution conflicts with a pending change from another author — the system escalates to a human reviewer. The escalation preserves the full dialog context so the reviewer can pick up without repeating steps.

This architecture supports multiturn conversations with contextual awareness, allowing agents to reference earlier edits and build on previous review decisions within the same session.

The agent editing flow is illustrated in the following flow diagram.

![Diagram showing MCP plugin agent editing flow](_media/diagram-plugin-flow.png)

*Figure 2: ChangeDown agent editing environment and review integration call flow*

This solution integrates with your editing environment in the following ways for collaborative workflows.

- **CriticMarkup services:** – The CriticMarkup parser handles responses and addressing. The parser resolves ambiguous anchors using the matching cascade.
- **Agentic developer tools:** – The MCP tool server provides the orchestration framework for agent-driven editing workflows with full LINE:HASH addressing.
- **Generative AI with** **large language** **models:** – Large language models power context-aware edit generation — the model reads full document state via read_tracked_file before proposing attributed {--—--}changes, enabling responses that go beyond scripted intents.

**Why this design matters**

- **Your files, your rules.** The ChangeDown extension runs entirely in your own editor, giving you full control over customization, data retention, and compliance.
- **Built for performance.** Designed for responsive, real-time change tracking with minimal editor overhead.
- **Secure by design.** Local-first processing means your document data stays in your infrastructure at all times.
- **Deploy where you need.** Available as an open source extension supporting global teams, with local-first processing and no cloud dependency for all supported editing operations.

**Use cases across collaborative workflows**

Organizations across industries can find benefits in pursuing tracked, AI-assisted document management solutions.

Healthcare organizations can enhance clinical documentation with intelligent template management, automated discharge summary drafting, and smart protocol routing that assigns revisions to the right specialist while maintaining comprehensive audit trails of every clinical document  revision.

Finance organizations can improve document self-service in situations like regulatory filing preparation, contract revision tracking, and compliance report generation, all while maintaining the strict change attribution and editorial audit trails that financial regulators require for audit readiness and operational transparency.

Government agencies can streamline policy document workflows with full change attribution, supporting inter-agency review processes with tracked revisions for benefit enrollment guides, permit application forms, and public records documentation.

**Workflow benefits**

Tracked AI editing transforms routine document revisions, {--—--}including content updates, structural reorganization, and style corrections, into streamlined self-service experiences. The integration delivers consistent editorial quality around the clock and scales to handle revision volume spikes without adding headcount or compromising review quality. The resultis consistent, quality support available around the clock without proportional staffing costs.

|     | **Step**              | **Traditional process**                                        | **With ChangeDown {--I--}integration integration**                                                                    |
| --- | --------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Author initiates edit | Opens file, makes changes without attribution (4– minute no audit trail) | Instant change tracking with author metadata using LINE:HASH coordinates (under 1 second)           |
| 2   | Review                | Reviewer manually diffs versions (2–3 min per file)           | ChangeDown presents inline changes with author, date, and reason in seconds           |
| 3   | Resolution            | 8–12 minute review cycle                               | 2–4 minute resolution with full context preserved                        |

Similar efficiency gains apply to content migration and multi-author consolidation workflows across all supported editing environments.

 contextual editing capabilities in the CriticMarkup matching cascade enables genuine contextual editing experiences. The system recognizes returning authors; it references their change history. {--ing--}It recognizes returning authors, references their change history, and anticipates revision patterns based on previous edits. This intelligent, empathetic approach builds loyalty by making every author feel known, not processed.

**Conclusion**

In today's collaborative editing deployments, organizations face a definitive challenge.The need to address {--H--}how to scale AI-assisted document workflows without sacrificing the editorial accountability that reviewers and compliance teams require. Through the open source CriticMarkup connector, combined with the MCP tool server and VS Code extension, delivers a production-ready solution.

Organizations implementing this open source CriticMarkup integration gain measurable advantages in editorial throughput review quality, and document integrity. This solution integrates with proven open source standards to improve every interaction and maintain context and intent across complete conversations,  improving your editorial experience.

Ready to transform your collaborative editing strategy? Connect with the ChangeDown open source community to design a deployment architecture tailored to your specific editorial workflow requirements.
