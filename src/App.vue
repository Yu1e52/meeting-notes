<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">语音转<span>会议纪要</span></div>
      <router-link to="/">🎙️ 会议列表</router-link>
      <router-link to="/settings">⚙️ AI 设置</router-link>
      <div class="foot">音频与数据存本机<br />转写 / 纪要需配置密钥</div>
    </aside>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>