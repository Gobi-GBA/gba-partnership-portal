// v4.3 partnership info upgrade — researched from gobi.vc, partner sites and public news (July 2026).
// Applied once via the meta table key "migration_v43_info_upgrade" in both storages.
// Only the fields present in each entry are updated; everything else is left untouched.

export interface UpgradeEntry {
  nameEn: string; // must match partnerships.name_en exactly
  lpStatus?: "na" | "target" | "lp";
  partnershipType?: string;
  startDate?: string;
  picNames?: string[];
  descriptionEn?: string;
  descriptionCn?: string;
}

export const V43_UPGRADES: UpgradeEntry[] = [
  {
    nameEn: "The University of Hong Kong",
    lpStatus: "lp",
    partnershipType: "Joint fund — Gobi–HKU Fund I (under HKU EEF)",
    picNames: ["Thomas G. Tsao", "Chibo Tang", "Fred Li"],
    descriptionEn:
      "Gobi, HKU and the HKIC launched the Gobi–HKU Fund I, a co-branded sub-fund of HKU's Entrepreneurship Engine Fund backing HKU deep-tech spin-offs. The fund reached a HK$120M first close (HK$240M target) with launch investments in Manifold Tech and AilsynBio; Gobi is the only GP selected to manage innovation funds set up by both HKU and HKUST.",
    descriptionCn:
      "戈壁创投与港大、香港投资管理有限公司共同发起 Gobi–HKU Fund I——港大创业引擎基金（EEF）旗下联名子基金，支持港大深科技衍生企业。基金首关1.2亿港元（目标2.4亿港元），首批投资 Manifold Tech 与 AilsynBio；戈壁是唯一同时获港大与科大遴选管理创新基金的GP。",
  },
  {
    nameEn: "HKU Medicine (HKUMed)",
    partnershipType: "University / technology-transfer ecosystem partnership",
    picNames: ["Fred Li"],
    descriptionEn:
      "Gobi engages HKUMed through the HKU technology-transfer ecosystem: Fred Li serves as lecturer, mentor and vetting panelist for HKUMed's Technology Transfer Unit, which publicly welcomed the Gobi–HKU Fund I biotech investments (AilsynBio, Immuno Cure).",
    descriptionCn:
      "戈壁通过港大技术转移生态与港大医学院合作：李国麟（Fred Li）担任其技术转移处的讲师、导师及评审，医学院亦公开欢迎 Gobi–HKU Fund I 的生物科技投资（AilsynBio、Immuno Cure）。",
  },
  {
    nameEn: "HKUST",
    lpStatus: "lp",
    partnershipType: "Joint fund — Gobi-Redbird Innovation Fund (under HKUST RIF)",
    startDate: "2025-10-13",
    picNames: ["Thomas G. Tsao", "Chibo Tang", "Fred Li", "Renee Pan", "Jason Chen"],
    descriptionEn:
      "HKUST, HKIC and Gobi launched the Gobi-Redbird Innovation Fund, the second fund under HKUST's HK$500M Redbird Innovation Fund, commercialising deep-tech spin-offs across biotech, Industry 4.0, AI/robotics and fintech (identified ventures include Lymow, Atom Semiconductor, Stellerus).",
    descriptionCn:
      "香港科技大学、港投公司与戈壁共同发起 Gobi-Redbird 创新基金——科大5亿港元红鸟创新基金旗下第二只基金，推动生物科技、工业4.0、AI/机器人及金融科技衍生企业商业化（已遴选 Lymow、Atom Semiconductor、Stellerus 等）。",
  },
  {
    nameEn: "CUHK Innovation Summit",
    partnershipType: "University MoU / investing partner (CUHK Innovation Limited)",
    startDate: "2024-04-25",
    descriptionEn:
      "CUHK Innovation Limited signed an MoU with Gobi (among nine investing partners) at the inaugural CUHK Innovation Summit in April 2024 to collaborate on commercialising CUHK academic spin-offs; the summit continued into 2026 with an expanded investment platform.",
    descriptionCn:
      "香港中文大学创新有限公司于2024年4月首届中大创新峰会上与戈壁（九家投资伙伴之一）签署合作备忘录，共同推动中大学术衍生企业商业化；峰会延续至2026年并扩大投资平台。",
  },
  {
    nameEn: "J.P. Morgan",
    partnershipType: "Event partner / speaking engagement",
    picNames: ["Chibo Tang"],
    descriptionEn:
      "Gobi Managing Partner Chibo Tang moderated a panel at the J.P. Morgan Innovation House in March 2026 — an ecosystem and speaking engagement rather than a fund relationship.",
    descriptionCn:
      "戈壁管理合伙人唐启波（Chibo Tang）于2026年3月在 J.P. Morgan Innovation House 主持圆桌讨论，属生态与演讲合作，并非基金关系。",
  },
  {
    nameEn: "HKVCA",
    partnershipType: "Industry association / event speaker",
    picNames: ["Chibo Tang", "Hing Cheng"],
    descriptionEn:
      "Gobi participates in HKVCA flagship events: Chibo Tang spoke at the 2026 Greater China Private Equity Summit and Hing Cheng joined a Southeast Asia panel at the Asia Venture Capital Forum 2025.",
    descriptionCn:
      "戈壁持续参与香港创业及私募投资协会旗舰活动：唐启波出席2026年大中华私募峰会演讲，郑興（Hing Cheng）参与2025年亚洲创投论坛东南亚专题讨论。",
  },
  {
    nameEn: "VCBeat",
    partnershipType: "Media / event partner (healthtech roundtable)",
    picNames: ["Leo Chen"],
    descriptionEn:
      "Gobi's Leo Chen joined the VB100 (VCBeat) \"Transaction Roundtable: Hong Kong Special\" in April 2026, discussing the GBA healthcare sector and the Gobi–HKU Fund — a media and event engagement.",
    descriptionCn:
      "戈壁陈天翼（Leo Chen）于2026年4月参加动脉网 VB100「交易圆桌·香港专场」，探讨大湾区医疗健康赛道及 Gobi–HKU 基金，属媒体活动合作。",
  },
  {
    nameEn: "HKIC",
    lpStatus: "lp",
    partnershipType: "Anchor investor — Patient Capital Strategic Fund",
    picNames: ["Thomas G. Tsao", "Chibo Tang"],
    descriptionEn:
      "HKIC — the HKSAR Government's patient-capital arm — set up a Patient Capital Strategic Fund with Gobi and anchors both the Gobi-Redbird Innovation Fund (HKUST) and the Gobi–HKU Fund I. Gobi calls HKIC a longtime strategic partner; Chibo Tang and Thomas G. Tsao took leading roles at HKIC's 2025 International Forum for Patient Capital.",
    descriptionCn:
      "香港投资管理有限公司（港投公司）作为特区政府耐心资本平台，与戈壁设立「耐心资本策略基金」，并为 Gobi-Redbird 创新基金（科大）及 Gobi–HKU Fund I 的基石投资人。戈壁视港投为长期战略伙伴；唐启波与曹嘉泰（Thomas G. Tsao）在其2025年国际耐心资本论坛担任重要角色。",
  },
  {
    nameEn: "Phoenix TV",
    partnershipType: "Event partner (forum speaker)",
    picNames: ["Fred Li"],
    descriptionEn:
      "Gobi Managing Director Fred Li joined the 2026 Phoenix Financial Forum for the Greater Bay Area (part of the 20th Shenzhen International Financial Expo) as a panellist on industrial-chain finance.",
    descriptionCn:
      "戈壁董事总经理李国麟出席2026年凤凰湾区财经论坛（第二十届深圳国际金融博览会平行活动），参与产业链金融专题讨论。",
  },
  {
    nameEn: "CFA Society Hong Kong",
    partnershipType: "Media / thought-leadership partner (CFA Control Room)",
    picNames: ["Fred Li"],
    descriptionEn:
      "CFA Society Hong Kong featured Gobi's Fred Li on Episode 7 of its CFA Control Room programme (Nov 2023), discussing Greater Bay Area startup funding and capital flows.",
    descriptionCn:
      "香港特许金融分析师协会于2023年11月邀请戈壁李国麟参与《CFA Control Room》第七集，探讨大湾区初创融资与资本流动。",
  },
  {
    nameEn: "HKSTP",
    partnershipType: "Ecosystem partner (Global Connect)",
    picNames: ["Fred Li"],
    descriptionEn:
      "Gobi is an HKSTP ecosystem partner listed in the Global Connect partner network, with Fred Li serving as a mentor and vetting panelist across Hong Kong ecosystem institutions including HKSTP.",
    descriptionCn:
      "戈壁为香港科技园 Global Connect 伙伴网络成员，李国麟在包括科技园在内的香港创科机构担任导师及评审。",
  },
  {
    nameEn: "GUIDE",
    partnershipType: "Gobi in-house ecosystem arm (programmes, delegations, bootcamps)",
    picNames: ["Kennith So"],
    descriptionEn:
      "GUIDE (Gobi University Innovation Development Ecosystem) is Gobi's independent affiliated ecosystem arm (est. 2023), running the Global-to-GBA Program with Cyberport, the GUIDE Delegation Series and university bootcamps; Program Director Kennith So co-leads the Cyberport programme.",
    descriptionCn:
      "GUIDE（戈壁大学创新发展生态）为戈壁旗下独立生态平台（2023年成立），运营与数码港合办的 Global-to-GBA 计划、GUIDE 代表团系列及高校训练营；项目总监苏冠年（Kennith So）联合主理数码港项目。",
  },
  {
    nameEn: "Khazanah Nasional",
    lpStatus: "lp",
    partnershipType: "Sovereign LP — Gobi Dana Impak Ventures (Future Malaysia Programme)",
    startDate: "2023-03-16",
    picNames: ["Thomas G. Tsao", "Navvin Kumar"],
    descriptionEn:
      "Malaysia's sovereign wealth fund backs Gobi Dana Impak Ventures through its US$1.3B Dana Impak allocation under the Future Malaysia Programme; the fund has deployed into companies such as Care Concierge and SkyeChip. Navvin Kumar moderated the ecosystem panel during the 2025 HKIC delegation to Malaysia.",
    descriptionCn:
      "马来西亚主权财富基金国库控股通过「未来马来西亚计划」下13亿美元 Dana Impak 配置支持 Gobi Dana Impak Ventures 基金，已投资 Care Concierge、SkyeChip 等企业。Navvin Kumar 在2025年港投公司访马代表团期间主持生态圆桌。",
  },
  {
    nameEn: "NDC Philippines",
    lpStatus: "target",
    partnershipType: "Government MOU (prospective investment into Gobi)",
    startDate: "2025-11-12",
    picNames: ["Thomas G. Tsao", "Dan Chong", "Jason Gaisano", "Carlo Chen-Delantar", "Ken Ngo", "Phoebe Fontanilla"],
    descriptionEn:
      "Gobi signed an MOU with the Philippine National Development Company during Philippine Startup Week 2025 to support the Philippine Innovation Hub and founder development; NDC is also exploring an investment into Gobi to strengthen local capital formation.",
    descriptionCn:
      "戈壁于2025年菲律宾创业周与菲律宾国家开发公司签署合作备忘录，支持菲律宾创新中心及创始人培育；NDC 亦在探讨对戈壁进行出资，以强化本地资本形成。",
  },
  {
    nameEn: "Philippine Startup Week",
    partnershipType: "Event partner / speaker (report launches, MOUs, keynotes)",
    picNames: ["Carlo Chen-Delantar", "Ken Ngo", "Jason Gaisano"],
    descriptionEn:
      "Gobi (via Gobi-Core Philippine Fund) is a recurring Philippine Startup Week partner: it launched the Philippine Startup Ecosystem Report 2025 at the opening, delivered keynotes, and signed its NDC and DICT MOUs during the week; Carlo Chen-Delantar keynoted PHSW 2024.",
    descriptionCn:
      "戈壁（通过 Gobi-Core 菲律宾基金）为菲律宾创业周长期伙伴：在2025年开幕式发布《菲律宾创业生态报告》、发表主题演讲，并在会期签署 NDC 与 DICT 备忘录；Carlo Chen-Delantar 曾为2024年大会主讲嘉宾。",
  },
  {
    nameEn: "She Loves Tech",
    partnershipType: "Event partner / regional co-host (gender-lens investing)",
    descriptionEn:
      "Gobi has served as a key organizing and regional partner for She Loves Tech, co-hosting the Thailand chapter (2020) and acting as an ASEAN regional partner for the global women-in-tech competition.",
    descriptionCn:
      "戈壁为 She Loves Tech 全球女性科技创业大赛的重要组织与区域伙伴，曾联合主办2020年泰国赛区，并担任东盟区域伙伴，体现其性别视角投资理念。",
  },
  {
    nameEn: "Sunway iLabs",
    partnershipType: "Event/ecosystem partner (Startup World Cup Malaysia)",
    descriptionEn:
      "Gobi is a supporting partner of the Sunway iLabs-hosted Startup World Cup Malaysia Regional Finals (2023–2024), connecting Malaysian startups to global markets; separately, Sunway Group is an LP in Gobi's Malaysia-focused SuperSeed II Fund.",
    descriptionCn:
      "戈壁为双威 iLabs 主办的 Startup World Cup 马来西亚区域决赛（2023–2024）支持伙伴，助力马来西亚初创对接全球市场；此外，双威集团为戈壁马来西亚 SuperSeed II 基金的出资人。",
  },
  {
    nameEn: "The Circulars Accelerator",
    partnershipType: "Ecosystem partner (circular-economy innovation network)",
    picNames: ["Carlo Chen-Delantar"],
    descriptionEn:
      "Gobi is listed among the Innovation Ecosystem Partners of the WEF Circulars/Traceability-for-Circularity initiative (run by UpLink with Accenture), reflecting Gobi's circular-economy investing led by Carlo Chen-Delantar.",
    descriptionCn:
      "戈壁为世界经济论坛循环经济加速计划（UpLink 与埃森哲运营）的创新生态伙伴之一，由可持续发展主管 Carlo Chen-Delantar 主导循环经济投资布局。",
  },
  {
    nameEn: "Twin Towers Ventures",
    partnershipType: "MOU — deal-flow sharing & co-investment (PETRONAS Ventures)",
    startDate: "2023-09-19",
    picNames: ["Thomas G. Tsao"],
    descriptionEn:
      "Twin Towers Ventures (PETRONAS Ventures' investment arm) and Gobi signed an MoU in September 2023 to share deal flow, co-invest and exchange sustainable-innovation practices across Southeast Asia and the GBA, building on PETRONAS Ventures' prior investment in the AEF GBA Fund.",
    descriptionCn:
      "国油创投旗下 Twin Towers Ventures 与戈壁于2023年9月签署备忘录，在东南亚与大湾区共享项目源、联合投资并交流可持续创新实践，延续国油创投此前对 AEF 大湾区基金的投资。",
  },
  {
    nameEn: "MYStartup",
    partnershipType: "Event/ecosystem supporting partner (via SWC Malaysia)",
    descriptionEn:
      "Gobi supports the Startup World Cup Malaysia programme whose title partner is Cradle Fund through MYStartup; the relationship runs through this shared event and ecosystem support.",
    descriptionCn:
      "戈壁为 Startup World Cup 马来西亚项目的支持伙伴，该项目由 Cradle 基金通过 MYStartup 冠名；双方关系建立于共同的赛事与生态支持。",
  },
  {
    nameEn: "UpLink",
    partnershipType: "Ecosystem partner (WEF UpLink innovation network)",
    picNames: ["Carlo Chen-Delantar"],
    descriptionEn:
      "Gobi is an Innovation Ecosystem Partner of the World Economic Forum's UpLink platform, contributing to its circular-economy and traceability challenges; Carlo Chen-Delantar was named to the WEF Young Global Leaders Class of 2026.",
    descriptionCn:
      "戈壁为世界经济论坛 UpLink 开放创新平台的创新生态伙伴，参与循环经济与可追溯议题；Carlo Chen-Delantar 入选2026年世界经济论坛全球青年领袖。",
  },
  {
    nameEn: "Startup World Cup Malaysia",
    partnershipType: "Event partner (national startup competition)",
    descriptionEn:
      "Gobi is a partner of Startup World Cup Malaysia, helping select and mentor Malaysian startups competing for the US$1M Silicon Valley prize; in 2025 it supported the expanded Kuala Lumpur and Kuching chapters.",
    descriptionCn:
      "戈壁为 Startup World Cup 马来西亚合作伙伴，协助遴选并辅导角逐100万美元硅谷大奖的马来西亚初创；2025年支持扩展至吉隆坡与古晋赛区。",
  },
  {
    nameEn: "The Liveability Challenge",
    partnershipType: "Event partner (sustainability judge/speaker)",
    picNames: ["Carlo Chen-Delantar"],
    descriptionEn:
      "Gobi's Head of ESG & Circular Economy Carlo Chen-Delantar participates as a speaker and judge in The Liveability Challenge, the Temasek Foundation-backed sustainability challenge.",
    descriptionCn:
      "戈壁 ESG 与循环经济主管 Carlo Chen-Delantar 以评委及讲者身份参与淡马锡基金会支持的 The Liveability Challenge 可持续发展挑战赛。",
  },
  {
    nameEn: "DICT Philippines",
    partnershipType: "Government MOU (capacity building, talent development)",
    startDate: "2025-11-12",
    picNames: ["Thomas G. Tsao", "Dan Chong", "Jason Gaisano", "Carlo Chen-Delantar", "Ken Ngo", "Phoebe Fontanilla"],
    descriptionEn:
      "Gobi signed an MOU with the Philippine DICT during Philippine Startup Week 2025 focused on nationwide capacity building, employability and talent development for founders; Gobi also ran a DICT go-to-market webinar in July 2026.",
    descriptionCn:
      "戈壁于2025年菲律宾创业周与菲律宾信息与通信技术部签署备忘录，聚焦全国性的能力建设、就业与创始人人才培育；并于2026年7月举办 DICT 市场进入网络研讨会。",
  },
  {
    nameEn: "Echelon Philippines",
    partnershipType: "Event partner / speaker (e27 conference)",
    picNames: ["Carlo Chen-Delantar"],
    descriptionEn:
      "Gobi (Gobi-Core Philippine Fund) is a speaker and participating investor at e27's Echelon Philippines; Carlo Chen-Delantar was a featured speaker at the inaugural 2024 edition and Gobi returned among decision-makers in 2025.",
    descriptionCn:
      "戈壁（Gobi-Core 菲律宾基金）为 e27 旗下 Echelon 菲律宾大会的讲者及参与投资机构；Carlo Chen-Delantar 为2024年首届大会特邀讲者，2025年戈壁继续以投资决策方身份参与。",
  },
  {
    nameEn: "Alibaba Global Initiatives",
    partnershipType: "Event / programme partner (Netpreneur Masterclass, ecosystem report)",
    picNames: ["Carlo Chen-Delantar", "Jason Gaisano"],
    descriptionEn:
      "Gobi partners with Alibaba Global Initiatives on ecosystem programming — co-launching the 2023 Alibaba Netpreneur Masterclass with JCI Manila and co-organising the PHSW Founders' Night; separately, Gobi Partners GBA is the exclusive GP of the Alibaba Entrepreneurs Fund in Hong Kong.",
    descriptionCn:
      "戈壁与阿里巴巴全球计划在生态项目上合作——2023年与 JCI 马尼拉共同发起阿里巴巴创业者训练营，并联合主办菲律宾创业周创始人之夜；此外，戈壁大湾区为阿里巴巴创业者基金在香港的独家管理人。",
  },
  {
    nameEn: "Investors for Climate (I4C)",
    partnershipType: "Ecosystem partner / ambassadorship (climate investing)",
    picNames: ["Carlo Chen-Delantar"],
    descriptionEn:
      "Gobi's Carlo Chen-Delantar serves as the I4C Ambassador for Manila, leading a data-driven roadmap of investor sentiment toward climate in the Philippines (I4C Manila event, Dec 2025).",
    descriptionCn:
      "戈壁 Carlo Chen-Delantar 担任 Investors for Climate 马尼拉大使，主导以数据驱动的菲律宾气候投资意向路线图（2025年12月 I4C 马尼拉活动）。",
  },
  {
    nameEn: "Bank of Punjab",
    lpStatus: "lp",
    partnershipType: "LP / anchor investor + MOU — Techxila Fund II",
    startDate: "2024-12-12",
    picNames: ["Thomas G. Tsao"],
    descriptionEn:
      "Gobi signed an MOU with the Bank of Punjab and announced the US$50M Techxila Fund II in December 2024 during Punjab CM Maryam Nawaz Sharif's China visit; BoP provides deal flow, preferential debt financing and equity, and is the first Pakistani public-sector bank to invest in VC through a fund.",
    descriptionCn:
      "戈壁于2024年12月旁遮普省首席部长访华期间与旁遮普银行签署备忘录并发布5000万美元 Techxila 二期基金；该行提供项目源、优惠债务融资及股权出资，为巴基斯坦首家通过基金投资创投的公营银行。",
  },
  {
    nameEn: "JazzCash",
    partnershipType: "Strategic partnership (FGV portfolio distribution)",
    startDate: "2023-11-17",
    descriptionEn:
      "JazzCash and Fatima Gobi Ventures announced a strategic partnership in November 2023 to onboard FGV portfolio companies (Abhi, PriceOye, SastaTicket) onto JazzCash's network of 44M+ users, 300,000+ merchants and 230,000 agents.",
    descriptionCn:
      "JazzCash 与 Fatima Gobi Ventures 于2023年11月宣布战略合作，将 FGV 被投企业（Abhi、PriceOye、SastaTicket）接入 JazzCash 逾4400万用户、30万商户及23万代理网络。",
  },
  {
    nameEn: "Katalyst Labs",
    partnershipType: "Event partner (+92Disrupt conference)",
    picNames: ["Hisham Ibrahim", "Thomas G. Tsao", "Naiel Ikram", "Ali Mukhtar"],
    descriptionEn:
      "Gobi is a recurring partner of Katalyst Labs' +92Disrupt conference in Karachi; at the 2025 edition Hisham Ibrahim joined the \"Capital on Pause?\" investment panel and Gobi hosted the after-event dinner.",
    descriptionCn:
      "戈壁为 Katalyst Labs 在卡拉奇举办的 +92Disrupt 大会长期伙伴；2025年 Hisham Ibrahim 参与「Capital on Pause?」投资论坛，戈壁并主办会后晚宴。",
  },
  {
    nameEn: "IBA Karachi",
    partnershipType: "University MOU (via Fatima Gobi Ventures)",
    picNames: ["Naiel Ikram"],
    descriptionEn:
      "Fatima Gobi Ventures signed an MOU with IBA Karachi's Centre for Entrepreneurial Development in October 2025, connecting students and founders with investment insights, mentorship and industry networks; Naiel Ikram formalised the partnership.",
    descriptionCn:
      "Fatima Gobi Ventures 于2025年10月与卡拉奇工商管理学院创业发展中心签署备忘录，为学生与创始人对接投资洞见、导师辅导及行业网络；由 Naiel Ikram 代表签署。",
  },
  {
    nameEn: "PakLaunch",
    partnershipType: "Event partner (UNConference speaking)",
    picNames: ["Naiel Ikram"],
    descriptionEn:
      "Gobi/FGV Partner Naiel Ikram was a hosted speaker at PakLaunch's UNConference'25.2 (Riyadh, November 2025), engaging the Pakistani startup and diaspora ecosystem.",
    descriptionCn:
      "戈壁/FGV 合伙人 Naiel Ikram 受邀于2025年11月利雅得 PakLaunch UNConference'25.2 发表演讲，深化与巴基斯坦创业及侨民生态的连接。",
  },
  {
    nameEn: "LUMS LCE",
    partnershipType: "University partnership (technology incubation with Fatima Ventures)",
    picNames: ["Ali Mukhtar"],
    descriptionEn:
      "Under Ali Mukhtar's leadership, Fatima Ventures launched Pakistan's largest technology incubation centre with LUMS in 2017 — the National Incubation Center Lahore, hosted at LUMS's Syed Babar Ali School of Science and Engineering.",
    descriptionCn:
      "在 Ali Mukhtar 主导下，Fatima Ventures 于2017年与拉合尔管理科学大学共建巴基斯坦最大科技孵化中心——拉合尔国家孵化中心，落户于该校 Syed Babar Ali 理工学院。",
  },
  {
    nameEn: "National Incubation Centers (NICs)",
    partnershipType: "Ecosystem partnership (technology incubation)",
    picNames: ["Ali Mukhtar"],
    descriptionEn:
      "Gobi's Pakistan connection to the National Incubation Center programme runs through Fatima Ventures/LUMS, which launched NIC Lahore — the country's largest tech incubation centre — in 2017 under Ali Mukhtar's leadership.",
    descriptionCn:
      "戈壁与巴基斯坦国家孵化中心体系的联系源于 Fatima Ventures 与 LUMS：2017年在 Ali Mukhtar 主导下创办全国最大科技孵化中心——拉合尔国家孵化中心。",
  },
  {
    nameEn: "Cyberport",
    partnershipType: "Ecosystem partner (Global-to-GBA Program; investor network)",
    picNames: ["Kennith So"],
    descriptionEn:
      "Gobi co-organises the Global-to-GBA Program (Jul–Dec 2026) with its GUIDE arm and Cyberport, helping overseas AI, deep-tech and robotics startups enter the GBA; Kennith So co-leads the programme and Gobi has been in Cyberport's investor network since 2017.",
    descriptionCn:
      "戈壁携 GUIDE 与数码港合办 Global-to-GBA 计划（2026年7–12月），助力海外 AI、深科技与机器人初创进入大湾区；苏冠年联合主理该计划，戈壁自2017年起即为数码港投资者网络成员。",
  },
  {
    nameEn: "CUHK-Shenzhen",
    partnershipType: "University ecosystem partnership (spin-off mentoring)",
    picNames: ["Fred Li"],
    descriptionEn:
      "Gobi engages CUHK-Shenzhen through its university-ventures work, with Fred Li serving as a regular startup mentor for CUHK-Shenzhen research spin-offs across the Greater Bay Area.",
    descriptionCn:
      "戈壁通过大学创投业务与香港中文大学（深圳）合作，李国麟长期担任其科研衍生企业在大湾区的创业导师。",
  },
  {
    nameEn: "BIOHK",
    partnershipType: "Ecosystem partner (biotech advisory/mentoring)",
    picNames: ["Fred Li"],
    descriptionEn:
      "Gobi engages the BIOHK biotech ecosystem through Fred Li, who serves as lecturer, advisor and mentor for ecosystem partners including BIOHK, BIOCHINA, HKSTP and Cyberport as part of Gobi's healthcare university-ventures activity.",
    descriptionCn:
      "戈壁通过李国麟参与 BIOHK 生物科技生态，其在 BIOHK、BIOCHINA、香港科技园及数码港等生态伙伴中担任讲师、顾问与导师，属戈壁医疗健康大学创投业务的一环。",
  },
  {
    nameEn: "OASA",
    partnershipType: "Strategic ecosystem partnership (NewSpace / deep tech)",
    picNames: ["Fred Li"],
    descriptionEn:
      "Gobi formalised a strategic partnership with the Orion Astropreneur Space Academy in early 2026 to build a Hong Kong \"NewSpace venture bridge\", pairing Gobi's frontier-tech scaling experience with OASA's community of space founders and mentors.",
    descriptionCn:
      "戈壁于2026年初与 OASA（猎户座太空创业学院）达成战略合作，共建香港「新太空创投桥梁」，将戈壁前沿科技规模化经验与 OASA 太空创始人及导师社群相结合。",
  },
  {
    nameEn: "Cross Capital",
    lpStatus: "lp",
    partnershipType: "LP — Meranti ASEAN Growth Fund II",
    startDate: "2024-11-25",
    picNames: ["Thomas G. Tsao", "Kengo Suzuki"],
    descriptionEn:
      "Cross Capital, a Japanese business-development fund-of-funds, made an LP investment in Gobi's flagship Meranti ASEAN Growth Fund II and formed a strategic partnership (Nov 2024) to channel Japanese corporate capital into Southeast Asia; Kengo Suzuki leads the Japan relationship.",
    descriptionCn:
      "日本企业发展型母基金 Cross Capital 出资戈壁旗舰基金 Meranti ASEAN Growth Fund II 成为 LP，并于2024年11月建立战略合作，引导日本企业资本进入东南亚；日本合伙人铃木健吾（Kengo Suzuki）主理对日关系。",
  },
  {
    nameEn: "JR East TAKANAWA GATEWAY LiSH",
    partnershipType: "Global Network Partnership (Japan market entry / innovation hub)",
    startDate: "2025-11-27",
    picNames: ["Kengo Suzuki", "Thomas G. Tsao"],
    descriptionEn:
      "Gobi entered Japan in November 2025 as a Global Network Partner of JR East's TAKANAWA GATEWAY Link Scholars' Hub (LiSH), a smart-city innovation hub in TAKANAWA GATEWAY CITY, bridging Japan's innovation frontier with Southeast Asia's growth markets.",
    descriptionCn:
      "戈壁于2025年11月以 JR 东日本 TAKANAWA GATEWAY Link Scholars' Hub（LiSH）全球网络伙伴身份进入日本市场，该智慧城市创新枢纽位于高轮 GATEWAY CITY，连接日本创新前沿与东南亚增长市场。",
  },
  {
    nameEn: "NTT",
    partnershipType: "Strategic collaboration (startup matching, PoC, commercial engagement)",
    startDate: "2026-07-13",
    picNames: ["Kengo Suzuki", "Thomas G. Tsao"],
    descriptionEn:
      "Gobi announced a strategic collaboration with NTT in July 2026 to connect startups from Gobi's network with NTT Group companies for business matching, technology validation and cross-border commercial engagement between Japan and Southeast Asia.",
    descriptionCn:
      "戈壁于2026年7月宣布与 NTT 建立战略合作，将戈壁网络内初创对接 NTT 集团企业，开展业务撮合、技术验证及日本与东南亚间的跨境商业合作。",
  },
  {
    nameEn: "Tokyo Stock Exchange",
    partnershipType: "Event/forum partner (Malaysia–Japan Innovation & Capital Forum)",
    picNames: ["Kengo Suzuki"],
    descriptionEn:
      "Gobi co-hosted the Malaysia–Japan Innovation & Capital Forum with the Tokyo Stock Exchange and JETRO, convening policymakers, investors and founders on IPO/M&A pathways; TSE is an ongoing Japan collaborator in Gobi's cross-border work led by Kengo Suzuki.",
    descriptionCn:
      "戈壁与东京证券交易所及 JETRO 联合主办马来西亚—日本创新与资本论坛，汇聚政策制定者、投资人与创始人探讨 IPO/并购路径；东证为戈壁日本跨境业务的持续合作方，由铃木健吾主理。",
  },
  {
    nameEn: "JETRO",
    partnershipType: "Event/forum partner (Malaysia–Japan Innovation & Capital Forum)",
    picNames: ["Kengo Suzuki"],
    descriptionEn:
      "JETRO co-hosted the Malaysia–Japan Innovation & Capital Forum with Gobi and the Tokyo Stock Exchange, and is cited among Gobi's Japan collaborators strengthening cross-border investment between Japan and Southeast Asia.",
    descriptionCn:
      "日本贸易振兴机构（JETRO）与戈壁及东京证券交易所联合主办马来西亚—日本创新与资本论坛，为戈壁深化日本与东南亚跨境投资的重要合作方之一。",
  },
  {
    nameEn: "SU& Group",
    partnershipType: "Strategic agreement / joint fund (Korea–SEA co-investment)",
    startDate: "2025-06-24",
    descriptionEn:
      "SU& Group signed a strategic business agreement with Gobi in June 2025 for global co-investment, planning to jointly establish a fund targeting 500B+ Korean won over 3–5 years and to help Korean tech companies enter Southeast Asia through Gobi's network.",
    descriptionCn:
      "韩国 SU& 集团于2025年6月与戈壁签署全球联合投资战略协议，计划3至5年内联合设立目标规模逾5000亿韩元的基金，并借助戈壁网络助力韩国科技企业进入东南亚。",
  },
  {
    nameEn: "Vietnam Ministry of Science and Technology",
    lpStatus: "target",
    partnershipType: "Government engagement (national VC fund, exploratory)",
    startDate: "2026-03-19",
    picNames: ["Thomas G. Tsao"],
    descriptionEn:
      "A Gobi delegation led by Thomas G. Tsao met Vietnam's Ministry of Science and Technology in Hanoi in March 2026; Gobi expressed interest in joining Vietnam's national venture capital fund (Decree 264/2025) and connecting portfolio companies to Vietnam's high-tech market.",
    descriptionCn:
      "2026年3月，曹嘉泰率戈壁代表团在河内会见越南科学技术部；戈壁表达参与越南国家创投基金（第264/2025号法令设立）的意向，并希望将被投企业对接越南高科技市场。",
  },
];

// New partner rows inserted by the v4.3 migration when missing (and appended to fresh seeds).
export const V43_NEW_PARTNERS: any[] = [
  {
    nameEn: "Thaioil",
    nameCn: "泰国石油",
    category: "corporate",
    region: "global",
    website: "https://www.thaioilgroup.com/en",
    logoUrl: "https://www.google.com/s2/favicons?domain=thaioilgroup.com&sz=128",
    descriptionEn:
      "Thai Oil Public Company Limited (Thaioil) is Thailand's largest oil refinery and a PTT Group subsidiary listed on the Stock Exchange of Thailand. Its CVC arm TOP Ventures (est. 2019) invests in venture funds and startups across sustainability, hydrocarbon-disruption and manufacturing technology.",
    descriptionCn:
      "泰国石油公众有限公司（Thaioil）为泰国最大炼油企业、PTT 集团旗下泰国上市公司。其企业创投平台 TOP Ventures（2019年成立）围绕可持续技术、油气颠覆技术与制造技术投资创投基金及初创企业。",
    contactName: "",
    contactEmail: "",
    picNames: [],
    partnershipType: "Limited partner (per internal record)",
    startDate: "",
    stage: "s3_agreement",
    collabLevel: 4,
    hallOfFame: 0,
    lpStatus: "lp",
    notes: "LP status per internal record; not confirmed in public sources as of Jul 2026.",
    context:
      "Thaioil is Thailand's largest and most complex refinery, a subsidiary of PTT Group. Its flagship investment arm TOP Ventures Co., Ltd. (established 2019, held via Thaioil Treasury Center) invests in corporate venture capital funds and startups across Sustainability Technology, Hydrocarbon Disruption Technology and Manufacturing Technology, supporting Thaioil's goal of new-business profit by 2030. (Sources: thaioilgroup.com; topventures.co.th)",
  },
];
