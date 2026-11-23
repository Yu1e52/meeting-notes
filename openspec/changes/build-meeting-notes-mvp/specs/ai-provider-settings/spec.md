# ai-provider-settings 规格增量

## Purpose

为转写与纪要功能提供统一的服务商配置入口：保存 OpenAI 兼容接口地址、密钥、对话模型与语音识别模型，密钥脱敏展示，连接可验证，配置后所有 AI 功能即刻生效。

## ADDED Requirements

### Requirement: AI 服务配置持久化

系统 SHALL 提供设置界面保存 baseUrl、apiKey、model（对话）、asrModel（语音识别）四项配置，配置 MUST 持久化在服务端并在重启后保留。apiKey 回显 MUST 脱敏（仅显示末 4 位），完整密钥 MUST NOT 通过查询接口返回前端。

#### Scenario: 保存并生效

- WHEN 用户填写四项配置并保存
- THEN 配置持久化，转写使用 asrModel、纪要使用 model 发起请求

#### Scenario: 密钥脱敏与保留

- WHEN 用户保存后重开设置页，或仅修改其他字段后提交
- THEN 密钥栏只显示掩码与末 4 位，已存密钥不被掩码覆盖

### Requirement: 连接测试

系统 SHALL 提供「测试连接」能力，用当前配置向对话模型接口发起一次真实最小请求，并如实展示成功或失败原因。

#### Scenario: 测试成功

- WHEN 配置有效且用户点击测试连接
- THEN 界面显示连接成功及所用模型名

#### Scenario: 测试失败

- WHEN 密钥无效或地址不可达
- THEN 界面显示真实失败原因，不显示成功