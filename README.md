# dsh-lan-manager

DSH web 插件：把本地 dsh 安全地暴露到局域网、Tailscale，并可选通过 Funnel 发布到公网。

- 原生 Caddy HTTPS 反代
- 本地 CA 证书，设备安装一次后可长期信任
- Tailscale Serve / Funnel 管理
- LAN、Serve、Funnel 三档独立 Basic Auth 策略
- 设置页「远程访问」统一操作

## 安装

### DSH 插件市场 / CLI

```bash
dsh plugin --profile web add dsh-lan-manager
```

安装后重启 dsh，打开「设置 → 远程访问」。

### 手动安装

```bash
git clone <repo-url> dsh-lan
cd dsh-lan
./install.sh
./dsh --lan
```

## 拓扑

```text
LAN 客户端
  └─ https://<LAN_IP>:3081 ──────────┐
                                      ▼
                                  Caddy
                    https://:3081 ───┤
                    127.0.0.1:3082 ──┤
                                      └──► dsh 127.0.0.1:3080
                                      ▲
Tailscale 客户端                       │
  └─ https://<host>.ts.net ────────────┘
```

| 来源 | Caddy 识别 | 认证策略 |
|---|---|---|
| LAN | 外部 HTTPS 端口 | 可选 Basic Auth |
| Tailscale Serve | `Tailscale-User-Login` | 可选 Basic Auth |
| Tailscale Funnel | 无 Tailscale 用户身份 | 强制 Basic Auth |

## 配置

| 配置 | 默认 | 说明 |
|---|---|---|
| `port` | 3081 | LAN HTTPS 端口 |
| `localPort` | 3080 | dsh 本地 HTTP 端口 |
| `tailscalePort` | 3082 | Tailscale 到 Caddy 的回环端口 |
| `lanAuth` | false | LAN 是否要求 Basic Auth |
| `serveAuth` | false | Tailscale Serve 是否要求 Basic Auth |
| `funnelRequiresAuth` | true | Funnel 是否强制 Basic Auth |
| `basicAuthUser` | dsh | Basic Auth 用户名 |
| `autoStart` | false | dsh 启动时自动拉起 Caddy |
| `tailscaleAutoStart` | false | dsh 启动时自动连接 Tailscale |
| `tailscale` | true | 启用 Tailscale 控制 |
| `certNotice` | false | CA 安装提示横幅 |

配置通过 profile 的 `cordis.patch.yml` 修改；运行时的开关状态保存在 dsh 数据目录。

## 运行时目录

```text
~/.dsh/dsh-lan-manager/caddy/
├── Caddyfile
├── auth-state.json
├── lan-state.json
├── certs/
└── caddy.log
```

支持 `DSH_HOME` 覆盖 dsh 数据根目录。

## 安全

- Basic Auth 使用 bcrypt hash，不保存明文密码。
- Funnel 是公网入口，至少强制 Basic Auth；正式公网使用建议再叠加限流、限时和审计。
- `/ca.crt` 保持免认证，便于设备首次安装证书。

## 依赖与平台

- 推荐：Linux / WSL2
- Caddy 2.8+
- Tailscale 可选

macOS 部分兼容，Windows 原生暂建议使用 WSL2。未安装 Caddy / Tailscale 时，设置页会给出安装引导。

## License

MIT
