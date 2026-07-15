import { createContext, useContext, useState, ReactNode } from "react";

export type Lang = "en" | "cn";

const dict = {
  // Nav
  navDirectory: { en: "Partners", cn: "合作伙伴" },
  navNetwork: { en: "Network", cn: "关系网络" },
  navHallOfFame: { en: "Hall of Fame", cn: "荣誉殿堂" },
  navSubmit: { en: "Register", cn: "登记合作" },
  navAdmin: { en: "Admin", cn: "管理后台" },
  navLogin: { en: "Sign in", cn: "登录" },
  navLogout: { en: "Sign out", cn: "退出" },
  brandTitle: { en: "Gobi Partnership Portal", cn: "戈壁合作伙伴门户" },
  brandSub: { en: "Gobi Partners · Global", cn: "戈壁创投 · 全球" },

  // Hero
  heroEyebrow: { en: "Gobi Partners · Global Network", cn: "Gobi Partners · 全球网络" },
  heroTitle: { en: "Our Partnership Ecosystem", cn: "我们的合作伙伴生态" },
  heroBody: {
    en: "Universities, corporates, government bodies and ecosystem builders working with us to turn breakthrough research into scalable ventures across our global network.",
    cn: "高校、企业、政府机构与生态伙伴与我们携手，把突破性科研成果转化为规模化企业，共建全球创科生态。",
  },
  statPartners: { en: "Partners", cn: "合作伙伴" },
  statActive: { en: "Active collaborations", cn: "深度合作中" },
  statMou: { en: "MOU & agreements", cn: "MOU 与协议" },
  statUniversities: { en: "Universities", cn: "合作高校" },

  // Directory
  searchPlaceholder: { en: "Search partners…", cn: "搜索合作伙伴…" },
  filterCategory: { en: "Category", cn: "类别" },
  filterStage: { en: "Stage", cn: "阶段" },
  filterAll: { en: "All", cn: "全部" },
  viewCards: { en: "Cards", cn: "卡片" },
  viewNetwork: { en: "Network", cn: "网络图" },
  noResults: { en: "No partners match your filters.", cn: "没有符合条件的合作伙伴。" },
  viewDetails: { en: "View details", cn: "查看详情" },
  collabLevel: { en: "Collaboration level", cn: "合作深度" },
  contact: { en: "Contact", cn: "联系人" },
  website: { en: "Website", cn: "官网" },
  partnershipType: { en: "Partnership type", cn: "合作类型" },
  startDate: { en: "Start date", cn: "开始日期" },
  notes: { en: "Notes", cn: "备注" },
  submittedOn: { en: "Registered", cn: "登记日期" },

  // Stages (01-05 pipeline)
  stage_s1_new: { en: "New / Target", cn: "新目标" },
  stage_s2_engaged: { en: "Engaged", cn: "接洽中" },
  stage_s3_agreement: { en: "MOU & Agreement", cn: "已签约" },
  stage_s4_progressive: { en: "Progressive", cn: "深化合作" },
  stage_s5_strategic: { en: "Strategic", cn: "战略伙伴" },

  // Categories
  cat_university: { en: "University", cn: "高校" },
  cat_corporate: { en: "Corporate", cn: "企业" },
  cat_government: { en: "Government", cn: "政府机构" },
  cat_investor: { en: "Investor", cn: "投资机构" },
  cat_accelerator: { en: "Accelerator / Park", cn: "加速器/园区" },
  cat_research: { en: "Research institute", cn: "科研院所" },
  cat_media: { en: "Media", cn: "媒体" },
  cat_ecosystem: { en: "Ecosystem", cn: "生态伙伴" },
  cat_other: { en: "Other", cn: "其他" },

  // Regions (domicile) — Gobi offices first
  filterRegion: { en: "Region", cn: "地区" },
  filterActive: { en: "Active (04–05)", cn: "活跃（04–05）" },
  browseAll: { en: "Browse the full partner list", cn: "浏览全部合作伙伴" },
  region: { en: "Region (domicile)", cn: "注册地区" },
  region_hongkong: { en: "Hong Kong", cn: "香港" },
  region_mainland: { en: "Chinese Mainland", cn: "中国内地" },
  region_malaysia: { en: "Malaysia", cn: "马来西亚" },
  region_singapore: { en: "Singapore", cn: "新加坡" },
  region_philippines: { en: "Philippines", cn: "菲律宾" },
  region_vietnam: { en: "Vietnam", cn: "越南" },
  region_indonesia: { en: "Indonesia", cn: "印尼" },
  region_pakistan: { en: "Pakistan", cn: "巴基斯坦" },
  region_japan: { en: "Japan", cn: "日本" },
  region_korea: { en: "South Korea", cn: "韩国" },
  region_taiwan: { en: "Taiwan", cn: "台湾" },
  region_sea: { en: "Southeast Asia", cn: "东南亚" },
  region_macau: { en: "Macau", cn: "澳门" },
  region_international: { en: "International", cn: "国际" },

  // PIC / hierarchy / context
  picLabel: { en: "Gobi PIC", cn: "戈壁负责人" },
  picsLabel: { en: "Gobi PICs", cn: "戈壁负责人" },
  selectPics: { en: "Select people in charge", cn: "选择负责人" },
  picsSelected: { en: "selected", cn: "已选" },
  testBannerTitle: { en: "Internal test version", cn: "内部测试版本" },
  testBannerBody: { en: "For team evaluation only — data may be reset without notice. Please do not share externally. — Fred Li & Elaine Zhang", cn: "仅供团队评估使用 — 数据可能随时重置，恕不另行通知。请勿对外分享。 — Fred Li 与 Elaine Zhang" },
  testBannerDismiss: { en: "Got it", cn: "知道了" },
  testWatermark: { en: "Internal testing only · note from developers Fred Li & Elaine Zhang", cn: "仅供内部测试 · 开发者 Fred Li 与 Elaine Zhang 备注" },
  viewTimeline: { en: "Timeline", cn: "时间线" },
  timelineFrom: { en: "From", cn: "从" },
  timelineTo: { en: "To", cn: "至" },
  timelineEmpty: { en: "No partnerships with a start date in this range.", cn: "该时间段内没有已记录开始日期的合作。" },
  timelineNoDate: { en: "without start date are hidden", cn: "个未填开始日期的合作未显示" },
  exportCsv: { en: "Export CSV", cn: "导出 CSV" },
  newBadge: { en: "NEW", cn: "新" },
  yearFilter: { en: "Year", cn: "年份" },
  allYears: { en: "All years", cn: "全部年份" },
  hofMode: { en: "Hall of Fame", cn: "荣誉殿堂" },
  allPartnersMode: { en: "All partners", cn: "全部伙伴" },
  exportBtn: { en: "Export", cn: "导出" },
  exportTitle: { en: "Export records", cn: "导出记录" },
  exportFields: { en: "Fields to include", cn: "选择导出字段" },
  exportHint: { en: "Exports the records matching the current filters.", cn: "导出当前筛选条件下的记录。" },
  exportExcel: { en: "Excel (.xlsx)", cn: "Excel (.xlsx)" },
  selectAll: { en: "Select all", cn: "全选" },
  clearAll: { en: "Clear all", cn: "清除" },
  exportStatusLabel: { en: "Status", cn: "状态" },
  exportCreatedLabel: { en: "Created", cn: "创建时间" },
  startDateRequired: { en: "Start date is required — check the partner announcement or news if unsure.", cn: "开始日期为必填项 — 如不确定，请查阅合作公告或新闻。" },
  changeSubmitted: { en: "Change request submitted — an admin will review it.", cn: "修改申请已提交 — 管理员将进行审核。" },
  versionLogTitle: { en: "System version log", cn: "系统版本日志" },
  versionLogSub: { en: "Upgrade report since the first version of the portal.", cn: "自门户首个版本以来的升级报告。" },

  // Updates & feedback (v4.2)
  navUpdates: { en: "Updates", cn: "系统动态" },
  updatesTitle: { en: "System update log", cn: "系统更新日志" },
  updatesSub: { en: "Every release of the portal, newest first.", cn: "门户的每次发布，最新在前。" },
  requestsTitle: { en: "System requests & feedback", cn: "系统需求与反馈" },
  requestsSub: {
    en: "Report an issue or suggest an improvement. The team reviews every request and tracks its status here.",
    cn: "报告问题或提出改进建议。团队会审阅每条请求，并在此跟踪处理状态。",
  },
  newRequest: { en: "Submit a request", cn: "提交需求" },
  requestPlaceholder: { en: "Describe the issue or the feature you need…", cn: "请描述遇到的问题或需要的功能…" },
  requestSubmitted: { en: "Request submitted", cn: "需求已提交" },
  myRequests: { en: "My requests", cn: "我的请求" },
  noRequests: { en: "No requests yet.", cn: "暂无请求。" },
  fbStatus_open: { en: "Open", cn: "待处理" },
  fbStatus_in_progress: { en: "In progress", cn: "处理中" },
  fbStatus_solved: { en: "Solved", cn: "已解决" },
  fbStatus_declined: { en: "Declined", cn: "已拒绝" },
  adminResponse: { en: "Team response", cn: "团队回复" },
  adminFeedback: { en: "System requests", cn: "系统需求" },
  fbNotePlaceholder: { en: "Reply / internal note shown to the requester…", cn: "回复或备注（提交者可见）…" },
  fbFrom: { en: "From", cn: "来自" },

  // Admin: add account (v4.2)
  addAccount: { en: "Add account", cn: "新增账户" },
  addAccountSub: { en: "Create a pre-approved account for a colleague. Share the password with them directly.", cn: "为同事创建已批准的账户，请直接告知对方密码。" },
  accountCreated: { en: "Account created", cn: "账户已创建" },
  emailTaken: { en: "This email is already registered", cn: "该邮箱已注册" },
  adminSearchUsers: { en: "Search accounts…", cn: "搜索账户…" },
  adminSearchRecords: { en: "Search records…", cn: "搜索记录…" },

  // Photo gallery (v4.2)
  photosLabel: { en: "Photos", cn: "照片" },
  photosHint: { en: "Image URLs, one per line", cn: "图片链接，每行一个" },
  photoOf: { en: "of", cn: "/" },
  whatsNew: { en: "What's new", cn: "更新内容" },
  currentVersion: { en: "Current", cn: "当前版本" },
  profileTitle: { en: "Edit profile", cn: "编辑个人资料" },
  profileSub: { en: "Update how your name, title and photo appear across the portal.", cn: "更新您在门户中显示的姓名、职位与照片。" },
  profileName: { en: "Name", cn: "姓名" },
  profileJobTitle: { en: "Title", cn: "职位" },
  profilePhoto: { en: "Photo", cn: "照片" },
  profilePhotoHint: { en: "Upload an image (max 400 KB) or paste an image URL.", cn: "上传图片（最大 400 KB）或粘贴图片链接。" },
  profilePhotoTooLarge: { en: "Image is too large — please use one under 400 KB.", cn: "图片过大 — 请使用 400 KB 以下的图片。" },
  profileSave: { en: "Save profile", cn: "保存资料" },
  profileSaved: { en: "Profile updated.", cn: "个人资料已更新。" },
  profileRemovePhoto: { en: "Remove photo", cn: "移除照片" },
  changeLogTitle: { en: "Change log", cn: "变更记录" },
  changeLogEmpty: { en: "No changes recorded yet.", cn: "暂无变更记录。" },
  auditBy: { en: "by", cn: "操作人：" },
  audit_create: { en: "Created", cn: "创建" },
  audit_update: { en: "Updated", cn: "更新" },
  audit_delete: { en: "Deleted", cn: "删除" },
  audit_change_request: { en: "Change requested", cn: "提交变更申请" },
  audit_change_approved: { en: "Change approved", cn: "变更已批准" },
  audit_change_rejected: { en: "Change rejected", cn: "变更已拒绝" },
  auditChangedFields: { en: "Changed", cn: "变更字段" },
  changeRequestHint: { en: "Your edits will be submitted as a change request for admin approval.", cn: "您的修改将作为变更申请提交，需管理员批准后生效。" },
  submitForApproval: { en: "Submit for approval", cn: "提交审批" },
  devNote: { en: "Developed by Fred Li and Elaine Zhang — every great partnership begins with a single connection. Keep building.", cn: "由 Fred Li 与 Elaine Zhang 开发 — 每一段伟大的合作，都始于一次真诚的连接。继续前行。" },
  picSelect: { en: "Relationship PIC (Gobi)", cn: "关系负责人（戈壁）" },
  picNone: { en: "Not assigned", cn: "未指定" },
  parentLabel: { en: "Parent partner", cn: "上级伙伴" },
  parentSelect: { en: "Parent organisation (optional)", cn: "上级机构（可选）" },
  parentNone: { en: "None — top level", cn: "无——顶层机构" },
  subEntities: { en: "Sub-entities", cn: "下属机构" },
  contextLabel: { en: "Context", cn: "背景说明" },
  contextHint: { en: "Narrative background — e.g. from reports, announcements or meeting notes", cn: "叙述性背景——如来自报告、公告或会议记录" },

  // Network
  networkTitle: { en: "Partnership Network", cn: "合作关系网络" },
  networkBody: {
    en: "A live map of our ecosystem. Node size reflects collaboration depth; colour reflects category. Drag nodes, scroll to zoom, click for details.",
    cn: "生态关系实时图谱。节点大小代表合作深度，颜色代表类别。可拖拽节点、滚轮缩放、点击查看详情。",
  },
  networkCenter: { en: "Gobi Partners", cn: "戈壁创投" },

  // Hall of fame
  hofTitle: { en: "Hall of Fame", cn: "荣誉殿堂" },
  hofBody: {
    en: "Our flagship partnerships — the collaborations that define our university–industry–research–investment ecosystem.",
    cn: "旗舰级合作伙伴——定义我们「政产学研投」生态的标杆合作。",
  },
  hofEmpty: { en: "No Hall of Fame partners yet.", cn: "暂无荣誉殿堂合作伙伴。" },

  // Auth
  loginTitle: { en: "Team sign in", cn: "团队登录" },
  loginBody: { en: "Sign in to register and manage partnerships.", cn: "登录后可登记与管理合作伙伴。" },
  email: { en: "Email", cn: "邮箱" },
  password: { en: "Password", cn: "密码" },
  name: { en: "Full name", cn: "姓名" },
  signIn: { en: "Sign in", cn: "登录" },
  createAccount: { en: "Create account", cn: "注册账号" },
  registerTab: { en: "Register", cn: "注册" },
  loginTab: { en: "Sign in", cn: "登录" },
  pendingApproval: {
    en: "Your account is awaiting admin approval. You'll be able to sign in once approved.",
    cn: "您的账号正在等待管理员审批，审批通过后即可登录。",
  },
  accountRejected: { en: "This account has not been approved.", cn: "该账号未获批准。" },
  registerSuccess: {
    en: "Account created — an admin will approve it shortly.",
    cn: "注册成功——请等待管理员审批。",
  },
  invalidCredentials: { en: "Invalid email or password.", cn: "邮箱或密码错误。" },
  registerAutoApproved: {
    en: "Account created and approved — you can sign in now.",
    cn: "注册成功并已自动获批，现在即可登录。",
  },
  registerEmailSent: { en: "A confirmation email has been sent.", cn: "确认邮件已发送。" },
  secretQuestionsTitle: { en: "Secret questions (for password recovery)", cn: "密保问题（用于找回密码）" },
  secretQuestion1: { en: "Question 1", cn: "问题一" },
  secretQuestion2: { en: "Question 2", cn: "问题二" },
  secretAnswer: { en: "Answer", cn: "答案" },
  secretQuestionPick: { en: "Choose a question…", cn: "选择一个问题…" },
  secretSameQuestion: { en: "Please choose two different questions.", cn: "请选择两个不同的问题。" },
  forgotPassword: { en: "Forgot password?", cn: "忘记密码？" },
  forgotTitle: { en: "Reset your password", cn: "重置密码" },
  forgotBody: {
    en: "Enter your account email, then choose how to reset.",
    cn: "输入您的账户邮箱，然后选择重置方式。",
  },
  forgotByEmail: { en: "Email me a reset link", cn: "发送重置链接到邮箱" },
  forgotByQuestions: { en: "Answer secret questions", cn: "回答密保问题" },
  forgotEmailSent: {
    en: "If the account exists, a reset link has been sent. The link expires in 1 hour.",
    cn: "如果该账户存在，重置链接已发送至邮箱，链接 1 小时内有效。",
  },
  forgotEmailUnavailable: {
    en: "Email sending is not configured yet — please use secret questions instead.",
    cn: "邮件发送尚未配置，请改用密保问题。",
  },
  forgotNoQuestions: {
    en: "No secret questions are set for this account. Use the email link or contact an admin.",
    cn: "该账户未设置密保问题，请使用邮箱链接或联系管理员。",
  },
  newPassword: { en: "New password", cn: "新密码" },
  confirmPassword: { en: "Confirm new password", cn: "确认新密码" },
  passwordMismatch: { en: "Passwords do not match.", cn: "两次输入的密码不一致。" },
  resetSubmit: { en: "Set new password", cn: "设置新密码" },
  resetSuccess: { en: "Password updated — sign in with your new password.", cn: "密码已更新，请使用新密码登录。" },
  resetInvalidToken: {
    en: "This reset link is invalid or has expired. Request a new one.",
    cn: "重置链接无效或已过期，请重新申请。",
  },
  resetWrongAnswers: { en: "One or both answers are incorrect.", cn: "答案不正确。" },
  backToSignIn: { en: "Back to sign in", cn: "返回登录" },
  sq_birth_city: { en: "In which city were you born?", cn: "您出生在哪个城市？" },
  sq_first_school: { en: "What was the name of your first school?", cn: "您的第一所学校叫什么名字？" },
  sq_first_pet: { en: "What was the name of your first pet?", cn: "您的第一只宠物叫什么名字？" },
  sq_mother_name: { en: "What is your mother's given name?", cn: "您母亲的名字是什么？" },
  sq_favorite_book: { en: "What is your favorite book?", cn: "您最喜欢的一本书是什么？" },
  sq_childhood_friend: { en: "What was your childhood best friend's name?", cn: "您童年最好的朋友叫什么名字？" },

  // Submit
  submitTitle: { en: "Register a partnership", cn: "登记合作伙伴" },
  submitBody: {
    en: "Submissions go to the admin for approval before appearing in the directory.",
    cn: "提交后需经管理员审批，方会显示在合作伙伴目录中。",
  },
  aiBoxTitle: { en: "AI quick-fill", cn: "AI 智能速填" },
  aiBoxBody: {
    en: "Paste an email or notes, or upload a PDF or Word document (EN/CN). AI will read it, show its understanding, then fill the form — including a best-estimate start date.",
    cn: "粘贴邮件或笔记，或上传 PDF、Word 文档（中/英文）。AI 将先展示其理解，再自动填写表单（含估算的开始日期）。",
  },
  aiBoxPlaceholder: { en: "Paste email or notes here…", cn: "在此粘贴邮件或笔记…" },
  aiUploadLabel: { en: "Or upload files (PDF / DOCX)", cn: "或上传文件（PDF / DOCX）" },
  aiExtract: { en: "Extract with AI", cn: "AI 智能提取" },
  aiExtracting: { en: "Reading & extracting…", cn: "阅读提取中…" },
  aiDone: { en: "Form filled — please review before submitting.", cn: "已自动填写，提交前请核对。" },
  aiFailed: { en: "Extraction failed — please fill manually.", cn: "提取失败，请手动填写。" },
  aiUnderstanding: { en: "AI understanding", cn: "AI 理解" },
  aiUnderstandingHint: { en: "Check this matches the material before trusting the filled fields.", cn: "请先确认 AI 理解无误，再核对自动填写的字段。" },
  nameEn: { en: "Partner name (English)", cn: "伙伴名称（英文）" },
  nameCn: { en: "Partner name (Chinese)", cn: "伙伴名称（中文）" },
  descriptionEn: { en: "Description (English)", cn: "简介（英文）" },
  descriptionCn: { en: "Description (Chinese)", cn: "简介（中文）" },
  contactName: { en: "Contact person", cn: "联系人" },
  contactEmail: { en: "Contact email", cn: "联系邮箱" },
  logoUrl: { en: "Logo URL", cn: "Logo 链接" },
  logoHint: { en: "Leave blank to auto-derive from website", cn: "留空则根据官网自动获取" },
  submitBtn: { en: "Submit for approval", cn: "提交审批" },
  submitting: { en: "Submitting…", cn: "提交中…" },
  submitted: { en: "Submitted — pending admin approval.", cn: "已提交，等待管理员审批。" },
  submittedAdmin: { en: "Partnership added to the directory.", cn: "合作伙伴已添加至目录。" },
  mySubmissions: { en: "My submissions", cn: "我的提交" },
  loginRequired: { en: "Please sign in to register a partnership.", cn: "请先登录后再登记合作伙伴。" },

  // Admin
  adminTitle: { en: "Admin console", cn: "管理后台" },
  adminUsers: { en: "Team accounts", cn: "团队账号" },
  adminPartnerships: { en: "Partnership records", cn: "合作记录" },
  approve: { en: "Approve", cn: "批准" },
  reject: { en: "Reject", cn: "拒绝" },
  delete: { en: "Delete", cn: "删除" },
  edit: { en: "Edit", cn: "编辑" },
  save: { en: "Save", cn: "保存" },
  editRecord: { en: "Edit record", cn: "编辑记录" },
  cancel: { en: "Cancel", cn: "取消" },
  status_pending: { en: "Pending", cn: "待审批" },
  status_approved: { en: "Approved", cn: "已批准" },
  status_rejected: { en: "Rejected", cn: "已拒绝" },
  role_admin: { en: "Admin", cn: "管理员" },
  role_staff: { en: "Staff", cn: "员工" },
  role_viewer: { en: "Viewer", cn: "只读" },
  roleLabel: { en: "Role", cn: "角色" },

  // Attachments
  attachments: { en: "Attachments", cn: "附件" },
  attachmentsHint: { en: "Supporting documents — MOU, agreements, photos (max 10MB each)", cn: "支持性文件——MOU、协议、照片（每个最大 10MB）" },
  addAttachment: { en: "Add files", cn: "添加文件" },
  noAttachments: { en: "No attachments", cn: "暂无附件" },

  // Change requests
  suggestChanges: { en: "Suggest changes", cn: "建议修改" },
  suggestChangesTitle: { en: "Suggest changes to an existing record", cn: "对现有记录建议修改" },
  suggestChangesBody: {
    en: "Pick a partner, edit the fields, and submit. An admin will review and approve your changes.",
    cn: "选择伙伴、修改字段并提交，管理员审核后生效。",
  },
  selectPartner: { en: "Select partner", cn: "选择伙伴" },
  changeNote: { en: "Note to admin (optional)", cn: "给管理员的备注（可选）" },
  submitChanges: { en: "Submit change request", cn: "提交修改申请" },
  changesSubmitted: { en: "Change request submitted — pending admin review.", cn: "修改申请已提交，等待管理员审核。" },
  changeRequests: { en: "Change requests", cn: "修改申请" },
  proposedChanges: { en: "Proposed changes", cn: "拟修改内容" },
  currentValue: { en: "Current", cn: "当前" },
  proposedValue: { en: "Proposed", cn: "拟改为" },
  registerNew: { en: "Register new", cn: "登记新伙伴" },
  viewerReadOnly: { en: "Viewer accounts are read-only.", cn: "只读账号无法提交。" },

  // Network layers
  layerBy: { en: "Group by", cn: "分层方式" },
  layerRegion: { en: "Region", cn: "地区" },
  layerType: { en: "Type", cn: "类型" },
  hallOfFameToggle: { en: "Hall of Fame", cn: "荣誉殿堂" },
  noPending: { en: "Nothing pending.", cn: "暂无待办事项。" },
  confirmDelete: { en: "Delete this record?", cn: "确定删除该记录？" },

  footerLine: {
    en: "Internal partnership registry · Gobi Partners",
    cn: "内部合作伙伴登记系统 · 戈壁创投",
  },
} as const;

export type DictKey = keyof typeof dict;

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  t: (k) => dict[k]?.en ?? String(k),
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = (key: DictKey) => dict[key]?.[lang] ?? dict[key]?.en ?? String(key);
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
