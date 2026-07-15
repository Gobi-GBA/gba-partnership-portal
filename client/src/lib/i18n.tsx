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
  brandTitle: { en: "GBA Partnership Portal", cn: "大湾区合作伙伴门户" },
  brandSub: { en: "Gobi Partners · Greater Bay Area", cn: "戈壁创投 · 大湾区" },

  // Hero
  heroEyebrow: { en: "Greater Bay Area · 大湾区", cn: "Greater Bay Area · 大湾区" },
  heroTitle: { en: "Our Partnership Ecosystem", cn: "我们的合作伙伴生态" },
  heroBody: {
    en: "Universities, corporates, government bodies and ecosystem builders working with us to turn breakthrough research into scalable ventures across Hong Kong and the Greater Bay Area.",
    cn: "高校、企业、政府机构与生态伙伴与我们携手，把突破性科研成果转化为规模化企业，共建香港与大湾区创科生态。",
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
  devNote: { en: "Developed by Fred Li and Elaine ZHANG — every great partnership begins with a single connection. Keep building.", cn: "由 Fred Li 与 Elaine ZHANG 开发 — 每一段伟大的合作，都始于一次真诚的连接。继续前行。" },
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

  // Submit
  submitTitle: { en: "Register a partnership", cn: "登记合作伙伴" },
  submitBody: {
    en: "Submissions go to the admin for approval before appearing in the directory.",
    cn: "提交后需经管理员审批，方会显示在合作伙伴目录中。",
  },
  aiBoxTitle: { en: "AI quick-fill", cn: "AI 智能速填" },
  aiBoxBody: {
    en: "Paste an email or notes, or upload a PDF, Word document or picture (EN/CN). AI will read it, show its understanding, then fill the form.",
    cn: "粘贴邮件或笔记，或上传 PDF、Word 文档或图片（中/英文）。AI 将先展示其理解，再自动填写表单。",
  },
  aiBoxPlaceholder: { en: "Paste email or notes here…", cn: "在此粘贴邮件或笔记…" },
  aiUploadLabel: { en: "Or upload files (PDF / DOCX / image)", cn: "或上传文件（PDF / DOCX / 图片）" },
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
    en: "Internal partnership registry · Gobi Partners GBA",
    cn: "内部合作伙伴登记系统 · 戈壁创投大湾区",
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
