# 交互式 AI 长篇小说引擎（纯前端 / 单人本地 / 质量优先）

> 目标：做一个真正可长期写作的“对话式小说操作系统”，不是一次性聊天玩具。

---

## 1) 你的约束已经明确（本版按这些落地）

- **纯前端**：不依赖自建后端服务。
- **单人本地**：默认本地运行、本地存储。
- **质量优先**：生成质量、人物一致性、伏笔回收优先于成本。
- **高缓存命中率**：在质量优先前提下，工程上尽量提升复用。
- **不需要多模态**：只做文本。
- **需要导出**：可导出对话/设定/世界观/时间线。
- **多脚本并行**：可同时维护多个世界观项目（不同 char + 不同 user 马甲）。
- **多题材模板**：按题材切换不同 prompt 套件（克苏鲁、恋爱喜剧、东亚出租屋文学等）。

---

## 2) 产品结构：从“一个会话”升级为“脚本工作台”

### 2.1 顶层对象：Project（脚本）

每个脚本是一个独立世界：

- 独立角色组（多个 user 马甲、多个 char、NPC）
- 独立记忆库（事件、关系、伏笔）
- 独立 prompt profile（题材模板）
- 独立导出记录

建议 UI 左上角有 `Project Switcher`：

- 新建脚本
- 克隆脚本（用于“同设定分支改写”）
- 冻结脚本（只读归档）

### 2.2 主界面（保持你要的极简）

- 中央：单纯干净对话框（故事输出 + 用户输入）
- 右侧 Sidebar（可折叠）：
  1. `User Personas`（多个 user 马甲）
  2. `Main Cast`（多个核心 char）
  3. `NPC Registry`
  4. `Story Graph`（关系网 + 剧情节点 + 伏笔）
  5. `Leader Console`（元指令历史与优先级）

---

## 3) 纯前端技术架构（推荐）

## 3.1 技术选型

- 框架：React + TypeScript
- 本地数据库：IndexedDB（Dexie 封装）
- 图关系：同样落在 IndexedDB（邻接表 + 索引）
- Embedding/检索：
  - **方案 A（已选）**：调用远端 embedding API，向量存本地
- LLM 调用：前端直连**兼容 OpenAI 格式**的模型 API（用户填自己的 key）
- 导出：**JSON（已选）**

## 3.2 为什么纯前端仍可做“长期记忆”

- 事件流、角色状态、图关系都可本地持久化。
- 召回时先本地检索，再把摘要送入模型。
- 单人场景无并发写冲突，状态机更容易保证一致性。

---

## 4) 数据模型（按多脚本并行重构）

> 所有数据都挂在 `project_id` 下，彻底隔离世界观。

- `projects`
  - id, name, genre_profile_id, created_at, archived
- `personas`（用户马甲）
  - id, project_id, name, background, goals, taboos, speaking_style
- `characters`（主角/核心角色）
  - id, project_id, name, role_type(main/npc), profile
- `character_state_snapshots`
  - character_id, turn_id, trait_vector, catchphrase_pack, relation_style, notes
- `npcs`（可与 characters 合并，也可单列方便管理）
  - id, project_id, first_seen_turn, status, inventory
- `relations`
  - project_id, from_id, to_id, type, intensity, valid_from_turn, valid_to_turn
- `events`
  - id, project_id, turn_id, summary, raw_text, tags, importance
- `plot_nodes`
  - id, project_id, title, cause_event_ids, consequence_event_ids, stakes
- `foreshadows`
  - id, project_id, setup_event_id, payoff_event_id, status
- `leader_directives`
  - id, project_id, turn_id, mode(soft/hard), directive_text, target_scope
- `memories`
  - id, project_id, entity_refs, chunk_text, embedding, salience, last_hit_at
- `exports`
  - id, project_id, type, created_at, version, payload_ref

---

## 5) 运行流水线（单回合）

1. 用户输入（剧情输入或 `leader` 指令）
2. 输入分类器识别：`story` / `leader` / `mixed`
3. 召回层：
   - 实体命中召回
   - 时间邻近召回
   - 图关系扩散召回
   - 伏笔优先召回
4. 上下文压缩：按 token budget 组装“最小充分上下文”
5. Writer 生成故事文本
6. Extractor 抽取结构化变更 JSON
7. Validator 校验冲突（一致性 / 时间线 / 已死亡角色等）
8. 落库：events + states + relations + memories

---

## 6) 缓存命中率设计（你特别关心）

质量优先不等于放弃缓存，建议做“**语义缓存 + 模板缓存 + 检索缓存**”。

### 6.1 三层缓存

1. **Prompt 模板缓存**
   - 题材模板、系统规则、角色卡模板做哈希缓存。
2. **检索结果缓存**
   - 对“同 query + 同项目 + 相近时间窗”缓存召回结果。
3. **生成片段缓存（谨慎启用）**
   - 仅缓存低风险段（如设定总结、回顾摘要），剧情正文少缓存。

### 6.2 命中率与质量平衡策略

- 缓存命中后不直接复用全文，而是“命中内容 + 当前状态微调再生成”。
- 对高风险段（关键转折、人物冲突）默认 bypass cache。
- 维护指标：
  - cache_hit_rate
  - cache_reuse_accept_rate（复用后未被用户撤销）
  - quality_regression_flag（命中后质量下降报警）

### 6.3 实操参数建议（初始值）

- retrieval cache TTL：30~120 分钟（按项目活跃度动态）
- summary cache TTL：长 TTL（24h+）
- critical scene cache：默认关闭

---

## 7) 多题材 Prompt Profile（可插拔）

每个题材是一个 profile，至少包含：

- `tone_rules`（语气/文风）
- `taboo_rules`（禁写项）
- `pace_rules`（节奏）
- `dialogue_rules`（对白倾向）
- `horror_or_romcom_controls`（题材特有控制）

### 7.1 你提到的三类，建议拆成三套模板

1. **克苏鲁恐怖**
   - 信息不对称、不可名状、理智值递减叙事
2. **恋爱喜剧**
   - 误会链、节奏快、对白密度高、冲突轻量可逆
3. **东亚阴暗潮湿出租屋文学**
   - 环境细节高权重、心理压抑慢渗透、关系边界模糊

> 工程上：`genre_profile_id` 绑定 project，可随时切换并保留历史版本。

---

## 8) leader 指令系统（建议正式化）

建议支持两种输入：

- 自然语言：`leader：把A和B的关系从对立改成脆弱同盟`
- DSL：
  - `leader.relation(A,B).type = fragile_alliance`
  - `leader.plot.add("第三章前出现失踪案")`
  - `leader.style.pace = slow_burn`

并给每条指令加：

- `mode=soft|hard`
- `scope=next_turn|chapter|global`
- `expires_at_turn`（可过期）

---

## 9) 导出能力（你明确需要）

最低应支持：

1. **会话导出**：完整聊天记录（含时间戳）
2. **故事导出**：按章节结构化写入 JSON
3. **世界观导出**：角色卡、关系图、伏笔表、时间线（JSON）
4. **工程快照导出**：可再导入（JSON bundle）

建议提供：

- “导出当前分支”
- “导出主线 + 分支对照”
- “仅导出已定稿章节”

---

## 10) MVP 开发顺序（纯前端可执行）

### Phase 1（2~3 周）
- 单项目对话
- user/char/NPC 基础管理
- event + memory 本地存储
- 基础召回

### Phase 2（2~4 周）
- Story Graph 可视化
- leader 指令（soft/hard）
- 结构化状态抽取与校验
- 导出分层 JSON（story/lore/snapshot）

### Phase 3（3~5 周）
- 多项目并行
- 多题材 profile 系统
- 缓存策略与命中率看板
- 分支世界线与回放

---

## 11) 已确认实施参数（已拍板）

1. 前端框架：React + TypeScript。
2. 模型 API：OpenAI 兼容格式；通常单 provider，但要支持用户频繁手动切换。
3. 本地加密：不需要。
4. 项目体量：按百万字规模设计存储与检索。

---

## 12) 一句话结论

你的想法完全可做成产品，而且**纯前端单人本地**很适合第一版：
先把“多脚本 + 高质量召回 + leader 可控 + 可导出”跑通，
再逐步把题材模板和缓存优化做深，就能稳定支撑长篇持续创作。


---

## 13) 已确定项（本次锁定）

- Embedding/检索：**方案 A**（远端 embedding API + 本地向量存储）
- 模型接入：**兼容 OpenAI 格式**的 API
- 导出格式：**JSON**

## 14) 最终决策落地（根据你最新确认）

1. Provider 策略：默认单 provider；提供“已保存 Provider 配置列表 + 一键切换”。
2. 导出需要区分，固定三类：
   - `story.json`（章节正文）
   - `lore.json`（角色/关系/伏笔）
   - `project_snapshot.json`（全量可恢复）
3. 本地加密：不做。
4. 体量目标：按百万字优化（分片存储、分页检索、增量索引）。
5. 只读发布包：不做。


## 15) API Provider 切换设计（你要求“方便手动切换”）

为兼顾“通常只有一个 provider”与“用户可能频繁切换”，建议实现：

- `provider_profiles` 本地表：
  - `id`, `name`, `base_url`, `api_key_ref`, `model_default`, `is_active`, `last_used_at`
- 顶栏 `Provider Switcher`：两次点击完成切换（下拉选择 -> 生效）
- 自动记忆最近选择：按 project 记忆 `last_provider_id`
- 安全最小化：虽然不做加密，也至少避免明文展示 key（UI 脱敏）

这样可以在不引入复杂多路由后端的前提下，实现前端本地的高可用切换体验。
