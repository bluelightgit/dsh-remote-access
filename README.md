# dsh-remote-access

DSH Web 插件，为本地 DSH 提供局域网访问、Tailscale Serve 和 Funnel 入口。

## 设计

```text
局域网客户端 ── HTTPS:3081 ──► Caddy ──┬─ /api/* ─► API Gateway:3083 ─► DSH:3080
                                      └─ 其他请求 ───────────────► DSH:3080

Tailscale ── Serve/Funnel ──► Caddy:3082 ──┬─ /api/* ─► API Gateway:3083
                                          └─ 其他请求 ─► DSH:3080
```

DSH 原始服务只监听 `127.0.0.1:3080`。Caddy 负责 HTTPS、入口识别和 Basic Auth；API Gateway 根据访问来源限制浏览器调用的 DSH API。配置、证书和运行状态保存在 DSH 数据目录。

## 访问模式

| 模式 | 入口 | 认证 | API 策略 |
| --- | --- | --- | --- |
| 本机 | `127.0.0.1:3080` | DSH 自身 | 完整权限 |
| LAN | `https://<LAN_IP>:3081` | 可选 Basic Auth | `lan` |
| Tailscale Serve | Tailscale 域名 | 可选 Basic Auth | `serve` |
| Tailscale Funnel | 公网 Tailscale 域名 | 强制 Basic Auth | `funnel`，仅基础 API |

LAN、Serve、Funnel 各自使用 API 白名单，默认只开放会话、消息、模型列表、技能列表等基础功能。设置、凭据、主机文件和模型探测等接口默认关闭。

设置页可以按访问模式勾选 API、配置 Basic Auth，并为 LAN / Serve 开启“允许全部 API”或“可信远程设置”。两项高权限能力不适用于 Funnel；插件自身的服务控制接口只接受本机页面请求。

## 安装

```bash
dsh plugin --profile web add @greenonion/dsh-remote-access
```

手动安装：

```bash
git clone <repo-url> dsh-remote-access
cd dsh-remote-access
node install.js
```

安装后重启 DSH，在“设置 → 远程访问”中操作 Caddy、Tailscale 和 API 策略。
启动反代时会在运行时目录自动生成本地 CA 和服务端证书。

## 运行环境

- Node.js `>=20`
- Caddy `2.8+`
- OpenSSL（生成本地 CA 和服务端证书）
- Tailscale（使用 Serve / Funnel 时需要）

核心功能支持 Linux、macOS 和 Windows；证书安装提示使用 mDNS 检测，在 Linux 和 macOS 上启用。默认端口为 LAN `3081`、Tailscale `3082`、API Gateway `3083`，可在 `cordis.patch.yml` 中调整。

运行时目录默认为 `~/.dsh/dsh-remote-access/`，可用 `DSH_HOME` 更改，主要包含动态生成的 `Caddyfile`、证书、认证信息和运行日志。

## 安全边界

- 远程请求先经过 Caddy 和 API Gateway，未知 API 默认拒绝；本机 loopback 保留 DSH 完整权限。
- LAN / Serve 不强制 Basic Auth；Funnel 始终要求 Basic Auth，并保持基础 API 策略。
- Caddy 使用插件独立的配置和 PID；关闭时只停止插件创建或确认属于插件的 Caddy/Tailscale 资源。
- Basic Auth 只保存 bcrypt hash；`/ca.crt` 用于设备安装本地 CA，保持免认证访问。

## License

MIT
