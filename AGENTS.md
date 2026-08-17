# AGENTS.md

## 必读技能（每次任务执行）

每次执行任务前，先读取并遵循 `code-comments` 技能（位于 `~/.codex/skills/code-comments/SKILL.md`）：

- 所有涉及写代码或改代码的任务，必须按该技能补充有意义的注释（文件级说明、函数/类/组件注释、关键逻辑行内注释）。
- 只读任务（不改代码）跳过应用步骤，但保留读取步骤。
- 每次运行完单测后，必须删除本次运行涉及的单测文件（含 conftest、setup、renderApp 等测试辅助文件），避免打包资源过载；端到端测试保留不删。

## Matt Pocock skill routing

For every user task, before responding or calling tools:

1. Read `/Users/alin/.codex/skills/ask-matt/SKILL.md` and use it as the routing policy.
2. Classify the request against the workflows and standalone skills described there.
3. Read and follow every applicable Matt Pocock `SKILL.md` before taking task actions, but do not invoke unrelated skills.
4. If no Matt Pocock skill applies, continue normally after completing the routing check.

An explicitly requested skill takes precedence over automatic routing. Higher-priority platform instructions and safety constraints remain in force. If the router or a selected skill cannot be read, state that briefly and continue with the best available workflow.

## Mandatory Git checkpoint skill

For every user task, after applying the Matt Pocock routing policy and before taking task actions, read and apply `/Users/alin/.codex/skills/commit-merge-push/SKILL.md`. For code-changing work, treat each coherent, independently verifiable small module as a checkpoint: create a Chinese commit, integrate it into `main` regardless of the source branch, and push `main` to the corresponding GitHub remote before continuing. For read-only tasks or tasks without repository changes, run only the skill's preflight and make no Git mutations.
