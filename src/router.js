import { createRouter, createWebHistory } from 'vue-router';
import MeetingsView from './views/MeetingsView.vue';
import MeetingDetailView from './views/MeetingDetailView.vue';
import SettingsView from './views/SettingsView.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: MeetingsView, meta: { title: '会议列表' } },
    { path: '/meetings/:id', component: MeetingDetailView, meta: { title: '会议详情' } },
    { path: '/settings', component: SettingsView, meta: { title: 'AI 设置' } }
  ]
});