<!-- ctrcks.com/v1: tracked -->

**ChangeTracks {++c++}[^ct-1]{--C--}[^ct-2]ollaborative Editing Powered by CriticMarkup**[^ct-3]

*By: Sarah Chen, Product Lead – ChangeTracks*

*James Rivera, Engineering – ChangeTracks*

*Maya Patel, Documentation – ChangeTracks*[^ct-4]

**{--Introduction--}[^ct-5]**

When teams collaborate on documents, they are not thinking about the underlying technology {~~—~>—~~}[^ct-6] they just want their edits tracked reliably and attributed correctly.

But {--most--}[^ct-7] document editing workflows face a familiar challenge: you have invested in {++sophisticated++}[^ct-8] {++AI agents++}[^ct-9] that can draft, revise, and restructure content, yet they {--bypass--}[^ct-10] every editorial safeguard your team depends on {--—--}[^ct-11] {~~~>—~~}[^ct-12]Edits arrive without {~~attribution~>attribution~~}[^ct-13]. Revisions overwrite previous work with no {~~record~>record~~}[^ct-14]. Reviewers discover changes only by diffing file versions after the fact{++,++}[^ct-15] {--—--}[^ct-16] reconstructing context from commit messages that rarely explain why a particular sentence was reworded or a paragraph reorganized.

That is why ChangeTracks and {++the CriticMarkup open standard++}[^ct-17] took a different approach{++.++}[^ct-18] {~~:~>Every edit is~~}[^ct-19] {--captured--}[^ct-20] inline, attributed to {~~its~>its~~}[^ct-21] author, with a reason attached.

The new {~~open-source~>open source~~}[^ct-22] {++CriticMarkup++}[^ct-23] connector for markdown editors gives teams a bring-your-own-vocabulary approach to change tracking. Rather than forcing a proprietary format, the connector maps every insertion, deletion, substitution{--,--}[^ct-24] {--"--}[^ct-25]highlight{~~"~>and comment~~}[^ct-26] to standard CriticMarkup delimiters that any text editor can render. This means organizations can integrate change tracking into their existing markdown pipelines without vendor lock-in, using the same files across VS Code, GitHub, static site generators, and documentation build systems that already process plain text natively{--,--}[^ct-27] while maintaining full editorial accountability.

For the {++more than++}[^ct-28] 10,000{--+--}[^ct-29] organizations running collaborative document workflows today, this integration delivers a practical path to tracked AI editing. Teams in {~~North America, Europe, and the Asia-Pacific region~>North America, Europe, and the Asia-Pacific region~~}[^ct-30] {++can++}[^ct-31] connect {++their++}[^ct-32] existing markdown toolchains to ChangeTracks without replacing their current editors or revision control systems{--+--}[^ct-33].

Here is how the integration works, where it fits across collaborative editing workflows, and what measurable improvements organizations report from deploying tracked change management.

**{~~ChangeTracks Integration Architecture and Design~>ChangeTracks~~}[^ct-34] {++integration++}[^ct-35] {++architecture and design++}[^ct-36]**

This integration connects your markdown editing environment to open-source CriticMarkup services through a {~~layered~>layered~~}[^ct-37] architecture designed for extensibility and reliability. {++The architecture comprises three integrated layers:++}[^ct-38]

{--F--}[^ct-39]{--igure--}[^ct-40] {--1--}[^ct-41] {--shows the component architecture for the ChangeTracks integration, illustrating how the VS Code extension, the MCP tool server, and the CriticMarkup parser work together to deliver tracked changes.--}[^ct-42]

{--![Diagram showing human and AI agent collaboration flow](changetracks-intro_media/7bf4b3672eb5431bc7fe4330e9c6237948fd6493.png)--}[^ct-43]

{--**Figure 1:** ChangeTracks extension integration with CriticMarkup services--}[^ct-44]

{--The architecture comprises three integrated layers:--}[^ct-45]

- **Editor** {--**interaction layer**--}[^ct-46] **interaction layer:** {++–++}[^ct-47] The VS Code extension captures every keystroke and cursor movement, accumulating edits into boundary-delimited change operations that wrap automatically in {--CriticMarkup (--}[^ct-48]CriticMarkup{~~)~>(CM)~~}[^ct-49] syntax before writing each attributed change to the file.
- **Connector layer:** {++–++}[^ct-50] The {~~open-source~>open source~~}[^ct-51] MCP tool server bridges AI agents to the same CriticMarkup format, translating propose_change calls into attributed edit operations with full metadata.
- **AI agent** {++**layer**++}[^ct-52] {~~**layer:**~>–~~}[^ct-53] Large language models and other AI agents interact with tracked files through the MCP tool server, generating context-aware edit proposals that reference LINE:HASH coordinates. The connector validates each proposal against the current file state before committing attributed changes to the {++CriticMarkup record using++}[^ct-54] {++the++}[^ct-55]{~~six-level matching cascade~>six-level matching cascade~~}[^ct-56]. Metadata extraction is handled by {++the footnote-native parser++}[^ct-57], delivering structured metadata extraction for attributed review responses.

{++This arc++}[^ct-58]{++hitecture is illustrated in the following NEEDS ACTION: replace with actual figure reference diagram++}[^ct-59]{++.++}[^ct-60]

{++![Diagram showing human and AI agent collaboration flow](changetracks-intro_media/7bf4b3672eb5431bc7fe4330e9c6237948fd6493.png)++}[^ct-61]

{++*Figure 1: ChangeTracks extension integration with CriticMarkup services overview*++}[^ct-62]

**{--How an--}[^ct-63] Agent {~~E~>e~~}[^ct-64]diting {~~F~>f~~}[^ct-65]low{--s End-to-End--}[^ct-66]**

{--![Diagram showing MCP plugin agent editing flow](changetracks-intro_media/39147bb8e8058267e9a1c5e85296161e951acca4.png)--}[^ct-67]

{--**Figure 2:** ChangeTracks Agent Editing and Review Integration Call flow--}[^ct-68]

When an agent connects to a tracked file in the editing environment, the following flow takes place:[^ct-69]

1. **Agent reads file state** {~~-~>–~~}[^ct-70] The agent reads the current file state through the MCP read_tracked_file tool, which returns every line with its LINE:HASH coordinate. The agent receives the full document context including pending changes, author metadata, and review status for each {--tracked--}[^ct-71] {~~operation~>tracked operation~~}[^ct-72].
2. **Parser interprets intent** {++–++}[^ct-73] {-----}[^ct-74] {~~The CriticMarkup parser~>The CriticMarkup parser~~}[^ct-75] processes the request and identifies the appropriate editing action from the agent instructions through three stages:
   1. **Change Detection:** {++–++}[^ct-76] {--The edit boundary engine detects keystroke sequences and cursor movements, segmenting them into discrete change operations for the tracking pipeline (--}[^ct-77]supporting{--)--}[^ct-78] {++thousands of++}[^ct-79] {--concurrent--}[^ct-80] editing sessions
   2. **Intent Understanding:** {++–++}[^ct-81] {--The footnote-native parser maps recognized text to editing intents such as insert, delete, substitute, highlight, and comment operations with full author (--}[^ct-82]attribution{--)--}[^ct-83]{--,--}[^ct-84] now enhanced with {~~LLM-powered contextual intent classification~>LLM-powered contextual intent classification~~}[^ct-85] for faster, description-based intent classification
   3. **Response Generation:** {++–++}[^ct-86] For straightforward requests, {~~the MCP tool server~>the MCP tool server~~}[^ct-87] generates a direct response using its built-in propose_change fulfillment. For complex editing tasks requiring document context, {~~the system~>the system~~}[^ct-88] routes to large language models (such as Claude) {++for nuanced revision proposals++}[^ct-89] that respect existing tracked changes{++.++}[^ct-90]

{--This architecture supports multi-turn conversations with contextual awareness, so an agent can reference earlier edits in the same session and build on previous review decisions.--}[^ct-91]

3. **Response flows back** {++–++}[^ct-92] {-----}[^ct-93] The MCP tool server formulates the edit proposal and routes it through the CriticMarkup parser for validation and serialization. The response includes fully attributed change operations with LINE:HASH coordinates. {~~The parser~>The parser~~}[^ct-94] {~~supports~>supports the~~}[^ct-95] {~~six-level matching cascade~>six-level matching cascade~~}[^ct-96] for fine-grained control over {++anchor resolution, whitespace normalization, and settled-text fallback (++}[^ct-97]STF{++)++}[^ct-98] in ambiguous contexts. The response flows back through the connector to the editor {~~via~>using~~}[^ct-99] the CriticMarkup protocol.
4. **Escalation when needed** {++–++}[^ct-100] {-----}[^ct-101] If the virtual agent {~~cannot~>can't~~}[^ct-102] resolve the editing request — for example, when a proposed substitution conflicts with a pending change from another author — the system escalates to a human reviewer. The escalation preserves the full dialog{--ue--}[^ct-103] context so the reviewer can pick up without repeating steps.

{++This architecture supports multiturn conversations with contextual awareness, allowing agents to reference earlier edits and build on previous review decisions within the same session.++}[^ct-104]

{++The agent editing flow is illustrated in the following flow diagram.++}[^ct-105]

{++![Diagram showing MCP plugin agent editing flow](changetracks-intro_media/39147bb8e8058267e9a1c5e85296161e951acca4.png)++}[^ct-106]

{++*Figure 2: ChangeTracks agent editing environment and review integration call flow*++}[^ct-107]

{~~How t~>T~~}[^ct-108]his solution integrates with your editing environment {++in the following ways for collaborative workflows.++}[^ct-109]

- **CriticMarkup services:** {++–++}[^ct-110] The CriticMarkup parser handles {--change detection and edit-boundary segmentation, while the footnote-native parser provides structured metadata extraction for attributed review (--}[^ct-111]responses{--)--}[^ct-112] and {--agentic developer tools provide the orchestration framework for agent-driven editing workflows with full LINE:HASH (--}[^ct-113]addressing{--)--}[^ct-114]. The parser resolves ambiguous anchors using {~~the six-level matching cascade~>the matching cascade~~}[^ct-115].
- **Agentic developer tools:** {++–++}[^ct-116] The MCP tool server provides the orchestration framework for agent-driven editing workflows with full LINE:HASH addressing.
- **Generative AI with** {++**large language**++}[^ct-117] **models:** {++–++}[^ct-118] Large language models power context-aware edit generation — {~~the model reads full document state~>the model reads full document state~~}[^ct-119] via read_tracked_file before proposing {~~attributed changes~>attributed changes,~~}[^ct-120] {--—--}[^ct-121]enabling responses that go beyond scripted intents.

**Why this design matters**

- **Your files, your rules.** The ChangeTracks {~~extension~>extension~~}[^ct-122] runs entirely in your own editor, giving you full control over customization, data retention, and compliance.
- **Built for performance.** Designed for responsive, real-time change tracking with minimal editor overhead.
- **Secure by design.** Local-first processing means your document data stays in your infrastructure at all times.
- **Deploy where you need.** Available as an open source extension supporting global teams{++, with local-first++}[^ct-123] processing and no cloud dependency for all supported editing operations.[^ct-124]

**Use cases across collaborative workflows**

{++Organizations++}[^ct-125] {++across industries can find benefits in pursuing tracked, AI-assisted document management solutions.++}[^ct-126]

{--**Healthcare:**--}[^ct-127]

{++Healthcare organizations can++}[^ct-128] enhance clinical documentation with intelligent template management, automated discharge summary drafting, and smart protocol routing that assigns revisions to the right specialist while maintaining comprehensive audit trails of every clinical document {--change--}[^ct-129] revision.

{--**Finance:**--}[^ct-130]

{++Finance organizations can++}[^ct-131] improve document self-service in situations like regulatory filing preparation, contract revision tracking, and compliance report generation, all while maintaining the strict change attribution and editorial audit trails that financial regulators require for audit readiness and operational {~~transparency~>transparency~~}[^ct-132].[^ct-133]

{--**Government:**--}[^ct-134]

Government agencies can streamline policy document workflows with full change attribution, supporting inter-agency review processes with tracked revisions for benefit enrollment guides, permit application forms, and public records documentation.[^ct-135]

**Workflow benefits**

{--**Editorial workflow automation:**--}[^ct-136]

{----}[^ct-137]Tracked AI editing transforms routine document revisions{++, including++}[^ct-138] {--—--}[^ct-139]content updates, structural reorganization, and style corrections, into streamlined self-service experiences. The integration delivers consistent editorial quality around the clock and scales to handle revision volume spikes without adding headcount or compromising review quality. The result{~~:~>is~~}[^ct-140] consistent, quality support available {~~24/7~>around the clock~~}[^ct-141] without proportional staffing costs.

|     | **Step**              | **Traditional {++p++}[^ct-142]{--P--}[^ct-143]rocess**                                        | **With {~~integration~>ChangeTracks integration~~}[^ct-144] {++i++}[^ct-145]{--I--}[^ct-146]ntegration**                                                                    |
| --- | --------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Author initiates edit | Opens file, makes changes without attribution (4{++–++}[^ct-147]{-----}[^ct-148] {~~min~>minute~~}[^ct-149] no audit trail) | Instant change tracking with author metadata {~~via~>using~~}[^ct-150] LINE:HASH coordinates (under 1 second)           |
| 2   | Review                | Reviewer manually diffs versions (2{~~-~>–~~}[^ct-151]3 min per file)           | {~~ChangeTracks~>ChangeTracks~~}[^ct-152] presents inline changes with author, date, and reason in sec{++onds++}[^ct-153]           |
| 3   | Resolution            | 8{++–++}[^ct-154]{-----}[^ct-155]12 minute review cycle                               | 2{++–++}[^ct-156]{-----}[^ct-157]4 minute resolution with full context preserved                        |

Similar efficiency gains apply to content migration and multi-author consolidation workflows across all supported editing environments.

{--**Personalized editorial engagement:**--}[^ct-158]

{--The CriticMarkup matching cascade's--}[^ct-159] {~~contextual editing~>contextual editing capabilities in the CriticMarkup matching cascade~~}[^ct-160] enables genuine contextual editing experiences. The system recognizes returning authors{--,--}[^ct-161]{++;++}[^ct-162] it references their change history{~~:~>. It~~}[^ct-163] recogniz{++es++}[^ct-164]{--ing--}[^ct-165] returning authors, referenc{++es++}[^ct-166]{--ing--}[^ct-167] their change history, and anticipat{++es++}[^ct-168]{--ing--}[^ct-169] revision patterns based on previous edits. This intelligent, empathetic approach builds loyalty by making every author feel known, not processed.

**{--Summary/--}[^ct-170]Conclusion**

In today's collaborative editing deployments, organizations face a definitive challenge{++.++}[^ct-171]{~~:~>The need to address h~~}[^ct-172]{--H--}[^ct-173]ow to scale AI-assisted document workflows without sacrificing the editorial accountability that reviewers and compliance teams require. Through the {~~open-source~>open source~~}[^ct-174] CriticMarkup connector, combined with the MCP tool server and VS Code extension, delivers a production-ready solution.

Organizations implementing this {--Open-source--}[^ct-175]{++o++}[^ct-176]{++pen source++}[^ct-177] {~~integration~>CriticMarkup integration~~}[^ct-178] gain measurable advantages in editorial throughput{--,--}[^ct-179] review quality, and document integrity. This solution integrates with proven {~~CriticMarkup~>open source~~}[^ct-180] standards to improve every interaction and maintain context and intent across complete conversations{++,++}[^ct-181] {--that--}[^ct-182] improv{~~es~>ing~~}[^ct-183] your editorial experience.

Ready to transform your collaborative editing strategy? {++Connect with the ChangeTracks++}[^ct-184] open source community {++to design a deployment architecture++}[^ct-185] tailored to your specific editorial workflow requirements.[^ct-186]

[^ct-1]: @editor | 2026-03-21 | ins | proposed

[^ct-2]: @editor | 2026-03-21 | del | proposed

[^ct-3]: @editor | 2026-03-21 | comment | proposed
    @editor 2026-03-21: This post was copyedited for grammar, spelling, capitalization, punctuation, terminology, and consistency issues. Other important issues are noted in comments, and you should consider revising the content accordingly before publication.

[^ct-4]: @editor | 2026-03-21 | comment | proposed
    @editor 2026-03-21: **NEEDS ACTION:** Please add byline information following the format provided

[^ct-5]: @editor | 2026-03-21 | del | proposed

[^ct-6]: @editor | 2026-03-21 | sub | proposed

[^ct-7]: @editor | 2026-03-21 | del | proposed

[^ct-8]: @editor | 2026-03-21 | ins | proposed

[^ct-9]: @editor | 2026-03-21 | ins | proposed

[^ct-10]: @editor | 2026-03-21 | del | proposed

[^ct-11]: @editor | 2026-03-21 | del | proposed

[^ct-12]: @editor | 2026-03-21 | sub | proposed

[^ct-13]: @editor | 2026-03-21 | sub | proposed

[^ct-14]: @editor | 2026-03-21 | sub | proposed

[^ct-15]: @editor | 2026-03-21 | ins | proposed

[^ct-16]: @editor | 2026-03-21 | del | proposed

[^ct-17]: @editor | 2026-03-21 | ins | proposed

[^ct-18]: @editor | 2026-03-21 | ins | proposed

[^ct-19]: @editor | 2026-03-21 | sub | proposed

[^ct-20]: @editor | 2026-03-21 | del | proposed

[^ct-21]: @editor | 2026-03-21 | sub | proposed

[^ct-22]: @editor | 2026-03-21 | sub | proposed

[^ct-23]: @editor | 2026-03-21 | ins | proposed

[^ct-24]: @editor | 2026-03-21 | del | proposed

[^ct-25]: @editor | 2026-03-21 | del | proposed

[^ct-26]: @editor | 2026-03-21 | sub | proposed

[^ct-27]: @editor | 2026-03-21 | del | proposed

[^ct-28]: @editor | 2026-03-21 | ins | proposed

[^ct-29]: @editor | 2026-03-21 | del | proposed

[^ct-30]: @editor | 2026-03-21 | sub | proposed

[^ct-31]: @editor | 2026-03-21 | ins | proposed

[^ct-32]: @editor | 2026-03-21 | ins | proposed

[^ct-33]: @editor | 2026-03-21 | del | proposed

[^ct-34]: @editor | 2026-03-21 | sub | proposed

[^ct-35]: @editor | 2026-03-21 | ins | proposed

[^ct-36]: @editor | 2026-03-21 | ins | proposed

[^ct-37]: @editor | 2026-03-21 | sub | proposed

[^ct-38]: @editor | 2026-03-21 | ins | proposed

[^ct-39]: @editor | 2026-03-21 | del | proposed

[^ct-40]: @editor | 2026-03-21 | del | proposed

[^ct-41]: @editor | 2026-03-21 | del | proposed

[^ct-42]: @editor | 2026-03-21 | del | proposed

[^ct-43]: @editor | 2026-03-21 | del | proposed
    image-dimensions: 4.5in x 1.125in

[^ct-44]: @editor | 2026-03-21 | del | proposed

[^ct-45]: @editor | 2026-03-21 | del | proposed

[^ct-46]: @editor | 2026-03-21 | del | proposed

[^ct-47]: @editor | 2026-03-21 | ins | proposed

[^ct-48]: @editor | 2026-03-21 | del | proposed

[^ct-49]: @editor | 2026-03-21 | sub | proposed

[^ct-50]: @editor | 2026-03-21 | ins | proposed

[^ct-51]: @editor | 2026-03-21 | sub | proposed

[^ct-52]: @editor | 2026-03-21 | ins | proposed

[^ct-53]: @editor | 2026-03-21 | sub | proposed

[^ct-54]: @editor | 2026-03-21 | ins | proposed

[^ct-55]: @editor | 2026-03-21 | ins | proposed

[^ct-56]: @editor | 2026-03-21 | sub | proposed

[^ct-57]: @editor | 2026-03-21 | ins | proposed

[^ct-58]: @editor | 2026-03-21 | ins | proposed

[^ct-59]: @editor | 2026-03-21 | ins | proposed

[^ct-60]: @editor | 2026-03-21 | ins | proposed

[^ct-61]: @editor | 2026-03-21 | ins | proposed
    image-dimensions: 4.5in x 1.125in

[^ct-62]: @editor | 2026-03-21 | ins | proposed

[^ct-63]: @editor | 2026-03-21 | del | proposed

[^ct-64]: @editor | 2026-03-21 | sub | proposed

[^ct-65]: @editor | 2026-03-21 | sub | proposed

[^ct-66]: @editor | 2026-03-21 | del | proposed

[^ct-67]: @editor | 2026-03-21 | del | proposed
    image-dimensions: 4.5in x 2.25in

[^ct-68]: @editor | 2026-03-21 | del | proposed

[^ct-69]: @editor | 2026-03-21 | comment | proposed
    @editor 2026-03-21: **NEEDS ACTION:** Lists need to be introduced with a sentence rather than a heading. I've added a suggestion. Please review for accuracy.

[^ct-70]: @editor | 2026-03-21 | sub | proposed

[^ct-71]: @editor | 2026-03-21 | del | proposed

[^ct-72]: @editor | 2026-03-21 | sub | proposed

[^ct-73]: @editor | 2026-03-21 | ins | proposed

[^ct-74]: @editor | 2026-03-21 | del | proposed

[^ct-75]: @editor | 2026-03-21 | sub | proposed

[^ct-76]: @editor | 2026-03-21 | ins | proposed

[^ct-77]: @editor | 2026-03-21 | del | proposed

[^ct-78]: @editor | 2026-03-21 | del | proposed

[^ct-79]: @editor | 2026-03-21 | ins | proposed

[^ct-80]: @editor | 2026-03-21 | del | proposed

[^ct-81]: @editor | 2026-03-21 | ins | proposed

[^ct-82]: @editor | 2026-03-21 | del | proposed

[^ct-83]: @editor | 2026-03-21 | del | proposed

[^ct-84]: @editor | 2026-03-21 | del | proposed

[^ct-85]: @editor | 2026-03-21 | sub | proposed

[^ct-86]: @editor | 2026-03-21 | ins | proposed

[^ct-87]: @editor | 2026-03-21 | sub | proposed

[^ct-88]: @editor | 2026-03-21 | sub | proposed

[^ct-89]: @editor | 2026-03-21 | ins | proposed

[^ct-90]: @editor | 2026-03-21 | ins | proposed

[^ct-91]: @editor | 2026-03-21 | del | proposed

[^ct-92]: @editor | 2026-03-21 | ins | proposed

[^ct-93]: @editor | 2026-03-21 | del | proposed

[^ct-94]: @editor | 2026-03-21 | sub | proposed

[^ct-95]: @editor | 2026-03-21 | sub | proposed

[^ct-96]: @editor | 2026-03-21 | sub | proposed

[^ct-97]: @editor | 2026-03-21 | ins | proposed

[^ct-98]: @editor | 2026-03-21 | ins | proposed

[^ct-99]: @editor | 2026-03-21 | sub | proposed

[^ct-100]: @editor | 2026-03-21 | ins | proposed

[^ct-101]: @editor | 2026-03-21 | del | proposed

[^ct-102]: @editor | 2026-03-21 | sub | proposed

[^ct-103]: @editor | 2026-03-21 | del | proposed

[^ct-104]: @editor | 2026-03-21 | ins | proposed

[^ct-105]: @editor | 2026-03-21 | ins | proposed

[^ct-106]: @editor | 2026-03-21 | ins | proposed
    image-dimensions: 4.5in x 2.25in

[^ct-107]: @editor | 2026-03-21 | ins | proposed

[^ct-108]: @editor | 2026-03-21 | sub | proposed

[^ct-109]: @editor | 2026-03-21 | ins | proposed

[^ct-110]: @editor | 2026-03-21 | ins | proposed

[^ct-111]: @editor | 2026-03-21 | del | proposed

[^ct-112]: @editor | 2026-03-21 | del | proposed

[^ct-113]: @editor | 2026-03-21 | del | proposed

[^ct-114]: @editor | 2026-03-21 | del | proposed

[^ct-115]: @editor | 2026-03-21 | sub | proposed

[^ct-116]: @editor | 2026-03-21 | ins | proposed

[^ct-117]: @editor | 2026-03-21 | ins | proposed

[^ct-118]: @editor | 2026-03-21 | ins | proposed

[^ct-119]: @editor | 2026-03-21 | sub | proposed

[^ct-120]: @editor | 2026-03-21 | sub | proposed

[^ct-121]: @editor | 2026-03-21 | del | proposed

[^ct-122]: @editor | 2026-03-21 | sub | proposed

[^ct-123]: @editor | 2026-03-21 | ins | proposed

[^ct-124]: @editor | 2026-03-21 | comment | proposed
    @editor 2026-03-21: **NEEDS ACTION:** Best practice for blog posts is to convey information in prose and reserve lists for information that should be itemized. This list would probably serve the reader better as prose; consider converting it. At the least, the list needs to be introduced with prose (i.e., a complete sentence not in boldface).

[^ct-125]: @editor | 2026-03-21 | ins | proposed

[^ct-126]: @editor | 2026-03-21 | ins | proposed

[^ct-127]: @editor | 2026-03-21 | del | proposed

[^ct-128]: @editor | 2026-03-21 | ins | proposed

[^ct-129]: @editor | 2026-03-21 | del | proposed

[^ct-130]: @editor | 2026-03-21 | del | proposed

[^ct-131]: @editor | 2026-03-21 | ins | proposed

[^ct-132]: @editor | 2026-03-21 | sub | proposed

[^ct-133]: @editor | 2026-03-21 | comment | proposed
    @editor 2026-03-21: **NEEDS ACTION:** I revised this section to prose. Please review for accuracy.

[^ct-134]: @editor | 2026-03-21 | del | proposed

[^ct-135]: @editor | 2026-03-21 | comment | proposed
    @editor 2026-03-21: **NEEDS ACTION:** Please revise to complete sentences

[^ct-136]: @editor | 2026-03-21 | del | proposed

[^ct-137]: @editor | 2026-03-21 | del | proposed

[^ct-138]: @editor | 2026-03-21 | ins | proposed

[^ct-139]: @editor | 2026-03-21 | del | proposed

[^ct-140]: @editor | 2026-03-21 | sub | proposed

[^ct-141]: @editor | 2026-03-21 | sub | proposed

[^ct-142]: @editor | 2026-03-21 | ins | proposed

[^ct-143]: @editor | 2026-03-21 | del | proposed

[^ct-144]: @editor | 2026-03-21 | sub | proposed

[^ct-145]: @editor | 2026-03-21 | ins | proposed

[^ct-146]: @editor | 2026-03-21 | del | proposed

[^ct-147]: @editor | 2026-03-21 | ins | proposed

[^ct-148]: @editor | 2026-03-21 | del | proposed

[^ct-149]: @editor | 2026-03-21 | sub | proposed

[^ct-150]: @editor | 2026-03-21 | sub | proposed

[^ct-151]: @editor | 2026-03-21 | sub | proposed

[^ct-152]: @editor | 2026-03-21 | sub | proposed

[^ct-153]: @editor | 2026-03-21 | ins | proposed

[^ct-154]: @editor | 2026-03-21 | ins | proposed

[^ct-155]: @editor | 2026-03-21 | del | proposed

[^ct-156]: @editor | 2026-03-21 | ins | proposed

[^ct-157]: @editor | 2026-03-21 | del | proposed

[^ct-158]: @editor | 2026-03-21 | del | proposed

[^ct-159]: @editor | 2026-03-21 | del | proposed

[^ct-160]: @editor | 2026-03-21 | sub | proposed

[^ct-161]: @editor | 2026-03-21 | del | proposed

[^ct-162]: @editor | 2026-03-21 | ins | proposed

[^ct-163]: @editor | 2026-03-21 | sub | proposed

[^ct-164]: @editor | 2026-03-21 | ins | proposed

[^ct-165]: @editor | 2026-03-21 | del | proposed

[^ct-166]: @editor | 2026-03-21 | ins | proposed

[^ct-167]: @editor | 2026-03-21 | del | proposed

[^ct-168]: @editor | 2026-03-21 | ins | proposed

[^ct-169]: @editor | 2026-03-21 | del | proposed

[^ct-170]: @editor | 2026-03-21 | del | proposed

[^ct-171]: @editor | 2026-03-21 | ins | proposed

[^ct-172]: @editor | 2026-03-21 | sub | proposed

[^ct-173]: @editor | 2026-03-21 | del | proposed

[^ct-174]: @editor | 2026-03-21 | sub | proposed

[^ct-175]: @editor | 2026-03-21 | del | proposed

[^ct-176]: @editor | 2026-03-21 | ins | proposed

[^ct-177]: @editor | 2026-03-21 | ins | proposed

[^ct-178]: @editor | 2026-03-21 | sub | proposed

[^ct-179]: @editor | 2026-03-21 | del | proposed

[^ct-180]: @editor | 2026-03-21 | sub | proposed

[^ct-181]: @editor | 2026-03-21 | ins | proposed

[^ct-182]: @editor | 2026-03-21 | del | proposed

[^ct-183]: @editor | 2026-03-21 | sub | proposed

[^ct-184]: @editor | 2026-03-21 | ins | proposed

[^ct-185]: @editor | 2026-03-21 | ins | proposed

[^ct-186]: @editor | 2026-03-21 | comment | proposed
    @editor 2026-03-21: **QUESTION:** is there a place somewhere in the post for this link?
    ChangeTracks Open Source Community
    [https://github.com/changetracks/community](https://github.com/changetracks/community)
