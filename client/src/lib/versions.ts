// System version log — shown to all signed-in users (upgrade report since v1).
export interface VersionEntry {
  version: string;
  date: string; // YYYY-MM-DD
  titleEn: string;
  titleCn: string;
  itemsEn: string[];
  itemsCn: string[];
}

export const CURRENT_VERSION = "4.2";

export const VERSIONS: VersionEntry[] = [
  {
    version: "4.2",
    date: "2026-07-15",
    titleEn: "Filters, feedback & photo galleries",
    titleCn: "筛选、反馈与照片展示",
    itemsEn: [
      "Filters now support selecting multiple options at once (category, stage, region, year)",
      "New Updates page — full system update log plus system requests & feedback",
      "Submit a system request from the portal and track its status (open / in progress / solved / declined)",
      "Admins can reply to requests, manage them in a new admin tab, and add team accounts directly",
      "Search boxes added to the admin console (partnership records and team accounts)",
      "Partner photo carousels — example galleries added for HKU, HKUST and HKIC",
    ],
    itemsCn: [
      "筛选器支持多选（类别、阶段、地区、年份）",
      "新增系统动态页面 — 完整更新日志与系统需求反馈",
      "可在门户内提交系统需求并跟踪处理状态（待处理 / 处理中 / 已解决 / 已拒绝）",
      "管理员可回复需求、在新的管理页签中处理，并可直接新增团队账户",
      "管理后台新增搜索框（合作记录与团队账户）",
      "合作伙伴照片轮播 — 已为港大、科大与港投公司添加示例图库",
    ],
  },
  {
    version: "4.1",
    date: "2026-07-15",
    titleEn: "Account security & email",
    titleCn: "账户安全与邮件",
    itemsEn: [
      "Forgot password — reset via an emailed link or by answering secret questions",
      "Secret questions are set during registration (bilingual, answers stored hashed)",
      "Confirmation email sent when registration completes",
      "@gobi.vc registrations are approved automatically as viewers — sign in right away",
    ],
    itemsCn: [
      "忘记密码 — 可通过邮箱重置链接或回答密保问题重置",
      "注册时设置密保问题（中英双语，答案加密存储）",
      "注册完成后自动发送确认邮件",
      "@gobi.vc 邮箱注册自动获批为查看者，无需等待审批",
    ],
  },
  {
    version: "4.0",
    date: "2026-07-15",
    titleEn: "Login-first, Gobi rebrand, timeline & audit",
    titleCn: "登录优先、Gobi 品牌升级、时间线与审计",
    itemsEn: [
      "Sign-in is now required before viewing any content",
      "Rebranded to Gobi Partners with the official logo (light/dark)",
      "Partnership stage (01-05) and collaboration level merged — stage is the single source of truth",
      "New timeline view with date-range and year filters",
      "Hall of Fame is now a mode inside the star map, with full filters",
      "Export records to Excel or CSV with selectable fields",
      "Start date is compulsory; AI quick-fill estimates it from documents",
      "AI quick-fill now runs on DeepSeek (PDF / DOCX / text)",
      "NEW badge on entries added within the last month",
      "Lists sorted by strategic level, then alphabetically",
      "Per-partner change log (who changed what, when) for audit",
      "Editable user profiles — title and photo",
      "Edit button in partner details for signed-in staff and admins",
      "Admin table shows PIC and start date columns",
    ],
    itemsCn: [
      "查看任何内容前必须先登录",
      "品牌升级为 Gobi Partners，启用官方标识（明暗两版）",
      "合作阶段（01-05）与协作等级合并 — 以阶段为唯一标准",
      "新增时间线视图，支持日期区间与年份筛选",
      "荣誉殿堂并入星图模式，支持全部筛选条件",
      "支持导出 Excel 或 CSV，可自选字段",
      "开始日期为必填项；AI 速填可从文档中估算",
      "AI 速填改用 DeepSeek（支持 PDF / DOCX / 文本）",
      "近一个月新增条目显示 NEW 标识",
      "列表按战略等级排序，再按字母排序",
      "每个伙伴均有变更记录（谁、何时、改了什么）以供审计",
      "用户可编辑个人资料 — 职位与照片",
      "登录后可在伙伴详情中直接编辑",
      "管理表新增负责人与开始日期列",
    ],
  },
  {
    version: "3.0",
    date: "2026-07-12",
    titleEn: "Full partner sync, star map & multi-PIC",
    titleCn: "全量伙伴同步、星图与多负责人",
    itemsEn: [
      "Synchronised the full 55-partner database",
      "Interactive star map (network view) of the partnership ecosystem",
      "Multiple Gobi PICs per partnership with avatar groups",
      "Developer note and internal-testing banner",
    ],
    itemsCn: [
      "同步全部 55 家合作伙伴数据库",
      "合作生态互动星图（网络视图）",
      "每个合作可指定多位戈壁负责人，头像组展示",
      "开发者署名与内部测试横幅",
    ],
  },
  {
    version: "2.0",
    date: "2026-07-10",
    titleEn: "Roles, AI quick-fill & attachments",
    titleCn: "角色权限、AI 速填与附件",
    itemsEn: [
      "Admin / staff / viewer roles with approval workflow",
      "AI quick-fill: paste text or upload documents to fill the form",
      "File attachments on partnership records",
      "01-05 partnership stage pipeline",
    ],
    itemsCn: [
      "管理员 / 员工 / 访客角色与审批流程",
      "AI 速填：粘贴文本或上传文档自动填表",
      "合作记录支持文件附件",
      "01-05 合作阶段管道",
    ],
  },
  {
    version: "1.0",
    date: "2026-07-08",
    titleEn: "First release — bilingual partnership portal",
    titleCn: "首个版本 — 双语合作伙伴门户",
    itemsEn: [
      "Bilingual (EN/CN) partnership directory with logos and details",
      "Login and admin approval for registering partnerships",
      "Persistent database storage",
      "Cosmic navy / gold / aqua styling after the Li Fo Venture Notes site",
    ],
    itemsCn: [
      "双语（中/英）合作伙伴目录，含标识与详情",
      "登录与管理员审批的合作登记流程",
      "持久化数据库存储",
      "沿用李佛创投笔记网站的深蓝 / 金 / 湖蓝风格",
    ],
  },
];
