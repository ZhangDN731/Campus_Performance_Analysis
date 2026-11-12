/* ============================================================
   ai-config.js — 硅基流动（SiliconFlow）AI 默认配置（独立文件）

   说明：
   · 本文件是 AI 接口的默认配置，与业务代码分离；非必要不要修改或替换本文件。
   · 在下方 defaultKey 填写的 Key 会作为全站默认 Key，写入仓库后所有
     浏览器 / 设备 / 新打开的页面都能读到，不再依赖本地浏览器保存。
   · 管理台「AI 配置」里手动保存的内容只存在当前浏览器 localStorage，
     优先级高于本文件；浏览器清空缓存后，仍回退到本文件的默认配置。
   · 轮换 Key 时，只需改这一个文件，其他页面与脚本无需改动。
   ============================================================ */
window.AI_CONFIG = {
  /* 接口地址（一般无需改动） */
  baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
  /* 文本模型 / 识图模型 */
  textModel: 'Qwen/Qwen2.5-7B-Instruct',
  visionModel: 'Qwen/Qwen2.5-VL-72B-Instruct',
  /* 管理员默认 Key（sk- 开头）；留空则未在本地配置时视为未接入 AI */
  defaultKey: ''
};
