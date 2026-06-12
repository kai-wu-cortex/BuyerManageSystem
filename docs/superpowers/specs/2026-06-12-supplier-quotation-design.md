# 供应商报价单小程序设计

## 1. 目标

在现有采购管理系统中新增“供应商报价单”小程序，用于：

- 保存供应商原始报价文件及结构化报价信息。
- 解析 Excel、PDF 和图片格式报价单。
- 在人工校对后生成可追溯的正式报价版本。
- 将同类型产品归入可人工调整的标准产品组。
- 对用户选定的报价版本进行统一口径换算和横向比较。
- 手工维护供应商质量、交期、服务和配合度评分。

首版不自动推荐中选供应商。系统只计算和突出最低价、最短交期等客观指标，最终决策由用户完成。

## 2. 已确认的业务规则

### 2.1 文件与解析

- 支持 Excel、PDF 和图片。
- 报价文件允许上传至云端 AI 进行识别。
- 原始文件必须长期保存，供预览、下载和审计追溯。
- Excel 优先在浏览器中提取表格内容；PDF 和图片使用 Gemini 识别。
- AI 返回结果必须符合固定 JSON Schema。
- 所有解析结果先进入人工校对，不直接成为正式报价。

### 2.2 产品归类

- AI 根据产品名称、规格、单位和包装信息推荐同类产品分组。
- 用户可以新建、合并、拆分和调整产品组。
- 未经人工确认的分组不得参与正式比价。
- 产品组定义标准名称、标准规格、基准单位和允许的换算规则。

### 2.3 价格标准化

系统同时保留原始价格和标准化价格。正式比价统一为：

- 人民币。
- 含税价格。
- 产品组的基准计量单位。
- 已展开包装规格后的单件或基准数量价格。

每张报价单保存固定汇率，确保历史结果可复算。换算需要保留币种、汇率、税率、原单位、包装数量、基准单位和计算依据。

### 2.4 报价版本与比较条件

- 同一供应商、同一产品可存在多个报价版本。
- 发起比价时由用户勾选具体报价版本，系统不自动替用户选择。
- 横向比较标准化单价、MOQ、交期、付款方式、报价有效期及供应商评分。
- 系统标识报价是否过期，但允许用户查看和选择历史报价用于分析。

### 2.5 供应商评分

评分由用户手工维护，包含：

- 质量评分。
- 交期评分。
- 服务评分。
- 配合度评分。
- 评分备注和更新时间。

各项采用 100 分制。首版不从采购订单自动计算评分，也不设置自动加权总分。

## 3. 总体架构

采用“私有对象存储 + MongoDB + Gemini”的方案。

### 3.1 前端

在现有 React/Vite 应用中增加独立懒加载模块 `supplier-quotes`，沿用当前小程序导航、页面风格和权限判断。模块包含：

- 报价单档案首页。
- 上传与解析入口。
- 左右对照校对页。
- 供应商资料与评分页。
- 标准产品组管理页。
- 横向矩阵比价页。

### 3.2 文件存储

- 原文件存入私有 Vercel Blob。
- 浏览器使用受控的客户端直传流程，避免大文件经过普通函数请求体。
- MongoDB 只保存 Blob 标识、路径、文件名、MIME 类型、大小和校验值。
- 文件预览和下载必须经过现有系统登录校验，并使用短时授权访问。
- Gemini Files API 中的文件仅用于临时解析，不作为系统档案。

### 3.3 业务数据

MongoDB 增加以下集合：

- `supplier_profiles`
- `supplier_quotations`
- `supplier_quotation_items`
- `supplier_quote_parse_jobs`
- `supplier_product_groups`
- `supplier_quote_audit_logs`

沿用现有 `/api/data` 数据访问模式，但为上传授权、解析任务、文件访问、批量校对和比价查询增加专用 API，避免将复杂业务规则塞进通用文档接口。

### 3.4 AI 解析

- 服务端读取私有原文件或临时上传至 Gemini Files API。
- 使用稳定的 `generateContent` 接口和结构化输出。
- 模型输出经过运行时 Schema 校验和业务校验后才能写入解析任务。
- AI 解析和产品分组推荐均视为建议数据，不直接修改正式报价。

## 4. 数据模型

### 4.1 SupplierProfile

- `id`
- `name`
- `normalizedName`
- `contactName`
- `contactPhone`
- `contactEmail`
- `qualityScore`
- `deliveryScore`
- `serviceScore`
- `cooperationScore`
- `scoreNote`
- `scoreUpdatedAt`
- `createdAt`
- `updatedAt`
- `deletedAt`

供应商规范名称需建立唯一索引，避免因空格、大小写或常见符号差异产生重复档案。

### 4.2 SupplierQuotation

- `id`
- `supplierId`
- `quotationNumber`
- `quotationDate`
- `validUntil`
- `currency`
- `exchangeRateToCny`
- `taxRate`
- `priceTaxMode`
- `paymentTerms`
- `leadTimeDays`
- `status`
- `sourceFile`
- `parseJobId`
- `version`
- `confirmedBy`
- `confirmedAt`
- `createdAt`
- `updatedAt`
- `deletedAt`

持久化流程状态为：

`parsing -> review_required -> active | voided`

系统根据 `validUntil` 和当前日期派生 `expired` 展示状态，不把过期写成独立流程状态；用户主动作废才记录为 `voided`。

### 4.3 SupplierQuotationItem

- `id`
- `quotationId`
- `lineNumber`
- `sourceProductCode`
- `sourceProductName`
- `sourceSpecification`
- `sourceUnit`
- `sourcePackageDescription`
- `sourcePackageQuantity`
- `sourceUnitPrice`
- `minimumOrderQuantity`
- `lineLeadTimeDays`
- `productGroupId`
- `groupMatchStatus`
- `normalizedQuantity`
- `normalizedUnit`
- `normalizedTaxIncludedCnyPrice`
- `normalizationDetails`
- `fieldConfidence`
- `reviewIssues`
- `createdAt`
- `updatedAt`
- `deletedAt`

### 4.4 SupplierProductGroup

- `id`
- `standardName`
- `standardSpecification`
- `baseUnit`
- `conversionRules`
- `aliases`
- `status`
- `confirmedBy`
- `confirmedAt`
- `createdAt`
- `updatedAt`
- `deletedAt`

`status` 为 `suggested` 或 `confirmed`。只有 `confirmed` 产品组进入正式比价。

### 4.5 SupplierQuoteParseJob

- `id`
- `quotationId`
- `fileId`
- `fileType`
- `status`
- `attemptCount`
- `parserVersion`
- `rawStructuredResult`
- `validationIssues`
- `errorCode`
- `errorMessage`
- `startedAt`
- `completedAt`
- `createdAt`
- `updatedAt`

任务状态为 `queued`、`processing`、`review_required`、`failed` 或 `completed`。

### 4.6 AuditLog

记录上传、重新解析、字段修改、确认生效、分组调整、评分修改、作废、软删除和恢复操作。每条日志包含操作人、时间、对象、操作类型及变更摘要。

## 5. 页面设计

### 5.1 报价单档案首页

采用已确认的“档案管理型”布局：

- 左侧为全部报价、待校对、有效报价、已过期、已作废、供应商和产品组入口。
- 主区域为报价单列表，支持供应商、状态、日期、产品和报价单号筛选。
- 顶部保留醒目的“上传报价单”按钮。
- 列表显示供应商、报价日期、有效期、币种、产品行数、状态和最近更新时间。
- 可从报价单进入原文件、校对记录、报价明细和审计日志。

### 5.2 解析校对页

采用已确认的“左右对照”布局：

- 左侧固定显示原始 Excel、PDF 或图片。
- 右侧显示报价基本信息和可编辑明细表。
- 低置信度、缺少必填字段或无法换算的字段使用醒目标识。
- 点击右侧字段时，左侧尽量定位对应原文区域。
- 用户可新增、删除、拆分和合并报价行。
- 所有阻断问题解决后才允许“确认并保存”。

### 5.3 产品组管理

- 展示 AI 推荐分组、匹配理由和置信度。
- 支持将报价行移动到已有产品组。
- 支持合并、拆分和新建产品组。
- 配置基准单位及包装、重量、长度、面积等换算规则。
- 无可靠换算规则时必须人工补充，不允许猜测换算。

### 5.4 横向矩阵比价

采用已确认的横向矩阵：

- 左侧固定比较项。
- 每个供应商及选定报价版本占一列。
- 顶部先选择标准产品组，再勾选候选报价版本。
- 展示原始单价、标准化单价、MOQ、交期、付款方式、有效期及四项评分。
- 最低标准化单价、最短交期和最高单项评分分别突出显示。
- 鼠标停留或展开可查看汇率、税率、包装和单位换算公式。
- 支持横向滚动，不自动生成综合排名或中选结论。

## 6. 核心流程

### 6.1 上传与解析

1. 用户选择 Excel、PDF 或图片。
2. 前端校验扩展名、MIME 类型、大小和重复文件校验值。
3. 前端获取一次性上传授权，将文件直传私有对象存储。
4. 系统创建报价草稿和解析任务。
5. Excel 在浏览器提取候选表格；PDF/图片由服务端调用 Gemini。
6. 服务端校验结构化结果并生成校对问题。
7. 任务进入 `review_required`，用户打开左右对照页。
8. 用户修正字段、确认产品分组和换算依据。
9. 校验通过后报价状态变为 `active`，写入审计日志。

### 6.2 产品分组

1. 规范化名称、规格、单位和包装描述。
2. 先按产品编码和已确认别名匹配。
3. 未命中时由 AI 推荐候选产品组及理由。
4. 用户确认、调整或创建新组。
5. 确认后的关系用于后续报价，但保留人工再次调整能力。

### 6.3 比价

1. 用户选择一个已确认的标准产品组。
2. 系统列出该组下各供应商的历史报价。
3. 用户勾选需要比较的具体报价版本。
4. 系统按报价单固定汇率、税率、包装数量和单位规则计算标准化价格。
5. 横向矩阵展示全部商务条件和供应商评分。
6. 用户可打开原报价和计算详情进行复核。

## 7. 校验与错误处理

- 上传失败可重试，不创建孤立的正式报价。
- 使用文件校验值和请求幂等键防止重复提交。
- AI 的超时、限流和临时服务错误采用有限次数指数退避重试。
- 凭证、格式或 Schema 错误不自动重试，直接进入可操作的失败状态。
- 解析失败时保留原文件，可重新解析或转为手工录入。
- 缺少供应商、报价日期、币种、汇率、价格、单位等必填信息时禁止生效。
- 税率、币种、包装数量或单位无法确定时禁止生成正式标准化价格。
- 不允许对重量与数量等不同量纲进行自动换算。
- 文件预览接口必须校验用户权限，禁止暴露永久公开地址。
- 删除业务记录采用软删除；对象文件的物理清理由单独的受控流程执行。

## 8. 权限

沿用现有登录与角色体系：

- `caigou`：可上传、校对、维护供应商评分、维护产品组、比价、作废和恢复。
- `caiwu`：首版不开放报价单小程序。
- 未授权用户：不可读取报价数据和原始文件。

当前项目登录成功后只把用户信息保存在浏览器本地存储，服务端无法据此验证调用者。报价单模块实施时必须补充服务端可验证的会话凭证，并至少满足：

- 登录成功后由服务端签发 HttpOnly、Secure、SameSite Cookie。
- 会话中包含用户 ID、角色和过期时间，并支持退出登录后失效。
- 上传授权、文件读取、解析、校对保存、评分、产品组和比价 API 均验证会话及 `caigou` 角色。
- 前端权限仅用于界面控制，不能替代服务端授权。

## 9. 测试与验收

### 9.1 单元测试

- Excel 表头识别和行提取。
- AI 结构化结果 Schema 校验。
- 含税与未税换算。
- 固定汇率换算。
- 包装数量和基准单位换算。
- 不同量纲拒绝换算。
- 产品候选匹配和人工确认状态。
- 报价有效期和状态派生。
- 供应商四维评分校验。
- 重复文件和幂等请求处理。

### 9.2 API 测试

- 上传授权只允许登录采购用户使用。
- 私有文件读取拒绝未授权请求。
- 解析任务成功、失败和重试状态正确。
- 批量校对保存是原子的，不产生半完成报价。
- 软删除和恢复保留审计记录。
- 比价查询只返回用户选定版本，并提供可复算的换算明细。

### 9.3 界面验收

- 档案首页可按供应商、状态、日期和产品检索。
- Excel、PDF、图片均可上传并进入校对。
- 校对页可同时查看原文件和结构化数据。
- 所有阻断问题清除前不能确认生效。
- 产品组可合并、拆分和调整。
- 比价页可选择任意历史报价版本。
- 横向矩阵正确展示并突出客观最优值。
- 用户能从标准化价格追溯到原始报价和完整换算过程。

## 10. 非目标

首版不包含：

- 独立微信小程序。
- 自动抓取实时汇率。
- 自动供应商履约评分。
- 自动推荐或审批中选供应商。
- 供应商外部自助报价门户。
- OCR 模型训练或自建识别服务。

## 11. 部署前提

- 创建私有 Vercel Blob 存储并配置访问凭证。
- 配置 Gemini API Key。
- 在 MongoDB 中创建新增集合和必要索引。
- Vercel CLI 当前未安装；实施部署配置时建议安装 `npm i -g vercel`，以便使用环境变量拉取、部署和日志功能。

## 12. 参考依据

- Vercel Blob 支持私有对象存储和客户端直传：
  https://vercel.com/docs/vercel-blob
  https://vercel.com/docs/vercel-blob/client-upload
- Gemini 支持 PDF 文档理解和 JSON Schema 结构化输出：
  https://ai.google.dev/gemini-api/docs/document-processing
  https://ai.google.dev/gemini-api/docs/structured-output
- Gemini Files API 文件为临时文件，不能替代系统档案：
  https://ai.google.dev/gemini-api/docs/files
