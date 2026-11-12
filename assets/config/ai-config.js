/* ============================================================
   ai-config.js — 硅基流动（SiliconFlow）AI 默认配置（独立文件）

   说明：
   · 本文件是 AI 接口的默认配置，与业务代码分离；非必要不要修改或替换本文件。
   · defaultKey 为管理员全局默认 Key；teachers 为按教师姓名配置的独立 Key。
   · 写入本文件后，所有浏览器 / 设备 / 新打开的页面都能读到，不再依赖本地
     浏览器保存；管理台「AI 配置」里手动保存的值优先级高于本文件。
   · 轮换 Key 时，只需改这一个文件，其他页面与脚本无需改动。
   ============================================================ */
window.AI_CONFIG = {
  /* 接口地址（一般无需改动） */
  baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
  /* 文本模型 / 识图模型 */
  textModel: 'Qwen/Qwen2.5-7B-Instruct',
  visionModel: 'Qwen/Qwen2.5-VL-72B-Instruct',
  /* 管理员全局默认 Key（sk- 开头） */
  defaultKey: 'sk-vurvtuogykryurxlqtjrudlprrxfzgiygnxzqkdotooaltba',
  /* 各教师独立 Key（按姓名匹配；未在此列出的教师回退到管理员默认 Key） */
  teachers: {
    '陈莹哲': 'sk-oytokbugzvqcozzdiafhrztquxvspdytbhpwcwpcvynmhkwk',
    '丁然': 'sk-keijnslgrdiubpxkeyfibqoomgdnfguzfhgpkejsmwpprgbu',
    '杜翠花': 'sk-itiaabkvanernjveknntbbukatnlddontsuadrtbzvhbnxrp',
    '杜得京': 'sk-gvacydisvsaculszqdgeyfsqtyjjnzksszhpbzexjyblynvh',
    '杜佳雯': 'sk-hltcortfuhaamszaqdcxematobxxadbgfwzrlrspgutqddvl',
    '贾晓迈': 'sk-bpzxgoekpthvkereibqohndngpjkhmmdurgzoihcqulhvfke',
    '李欣茹': 'sk-btfklyhfqntzdygryvreqovojgddpkmsovgnogmbtoviqyuv',
    '王敏婕': 'sk-chfpxaoslrkitriignaisjklyxnnmoqtasgdvgmnauqigsrj',
    '王玄烨': 'sk-rhxbeeomnxqebbqezqvbjcvbwczakanbvvwfhgeyyeioowhm',
    '吴恩乐': 'sk-wftfqgkuivuadcxowxbqpryuwhwdlgkkslvexgomlwczlvyg',
    '徐静娜': 'sk-rqgjttkzdmxveqdiybnjkjrjwzuyaoebodmxhikdbabokujf',
    '颜立营': 'sk-kskxgizfmjghldmiapdelqocunrhcissbtbshjsjkosusjbc',
    '尹雅蕾': 'sk-ilxoouwobhdshqtshgbrmqwoqcecefoqmsbynsuqsonmygqx',
    '张迪楠': 'sk-escbustmaypsmjwsqbyycypeimzimgnblhfpxtxywghwwprg',
    '张洁': 'sk-gzvvtgyeqvqcczlsonhtpljamboqmchnbigcgiecuklynutn',
    '赵晓亚': 'sk-qcwfzyxhldxcsocrdjxffyvcdysdtybnyduoogtoolvzqjbp',
    '周景辉': 'sk-ejgbfrnzozqljizeyrbkxnocvylgcnsvwurgfpitwxfhbqpc'
  }
};
