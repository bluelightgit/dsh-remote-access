# dsh-lan — LAN / Tailscale exposure for dsh web (Caddy + local CA + Tailscale)

把 dsh web 暴露到局域网(和可选的 Tailscale)的一整套可移植方案:
原生 Caddy 反代 + 本地 CA 证书 + dsh 设置页里的"远程访问"管理分区。

## 结构

```
dsh-lan/
├── dsh                        # 启动脚本:dsh / dsh --lan / dsh --lan-stop / dsh --stop
├── gen-cert.sh                # 证书管理器(本地 CA + 按当前 IP/mDNS/tailnet IP 重签)
├── install.sh                 # 一键把插件装进 web profile(通用安装器)
├── caddy/
│   ├── Caddyfile              # 反代配置(路径全部走 {$DSH_DEPLOY_DIR} 环境变量)
│   └── static/ca-install.html # 各设备安装 CA 的说明页
└── plugins/dsh-lan-manager/   # dsh 插件(host 编排 + client 设置页)
    ├── index.js               # host:管理 caddy/证书/tailscale,提供 /lan.status.json + /lan.action
    └── client/client.js       # 设置页 UI(设置 → 远程访问)
```

## 工作原理

- dsh 保持只监听 `127.0.0.1:3081`(明文),Caddy 在 `:3080` 终结 HTTPS 并转发。
- 证书:本地 CA(`caddy/certs/ca/`)签发的叶子证书,`gen-cert.sh` 每次 `dsh --lan`
  自动按当前局域网 IP / `<主机名>.local` / tailnet IP 重签。
- 设置页:注册在 `settings.section` 槽位(与 dsh 自带设置一致),状态检查 + 一键操作,
  所有 URL 自动生成,无需手输。
- Tailscale(可选):插件可执行 up/down/funnel/serve;`serve` 模式用公网受信证书,
  访问 `https://<机器名>.<tailnet>.ts.net/` 任何设备零警告。
- 证书安装提示横幅:**默认关闭**;设置页里可开启,开启后设备未装 CA 时页面底部提示。

## 安装(新机器)

```sh
# 1. 拷贝整个目录到目标机器任意位置(不依赖本机任何路径/IP/主机名)
# 2. 安装依赖:dsh(>=0.1.0-rc.6)、caddy 2.8+、可选 tailscale
# 3. 安装插件进 web profile
./install.sh
# 4. 启动
./dsh --lan
```

配置项(全部可选,均有运行时推导默认值):

| 配置 | 默认 | 说明 |
|---|---|---|
| `deployDir` | 插件自身位置推导 | 部署根目录 |
| `port` / `localPort` | 3080 / 3081 | 对外 https 端口 / dsh 回环端口 |
| `lanIp` | 运行时自动探测 | 局域网 IP |
| `autoStart` | true | dsh 启动时自动拉起反代 |
| `tailscale` | true | 暴露 tailscale 控制 |
| `certNotice` | **false** | 是否显示证书安装提示横幅 |

改配置:编辑 profile 的 `cordis.patch.yml`(lan-manager 行)后重启 dsh。

## 安全说明

- `/lan.action` 受**每次启动轮换的令牌**保护:`X-Lan-Token` 头必须匹配 dsh 页面
  (index) 里注入的 meta 令牌,否则 401。设置页自动携带,用户无感;局域网里的
  脚本/扫描器无法匿名调用。`/lan.status.json` 保持只读开放。
- 证书是本地 CA 签名:设备装 `caddy/certs/ca/ca.crt` 后浏览器不再警告;或走
  tailscale serve 用公网受信证书。
- 本仓库的 `.gitignore` 已排除全部本地运行时产物(证书/密钥/日志/pid/状态),
  commit 中不含任何机器数据。

## 常见问题

- **局域网其他设备访问不了?** 若部署在 WSL2(mirrored 模式),入站流量由
  Windows(Hyper-V)防火墙把关,默认拦截。在 Windows 管理员 PowerShell 执行:
  `New-NetFirewallHyperVRule -Name "dsh-lan-3080" -DisplayName "dsh LAN 3080" -Direction Inbound -Protocol TCP -LocalPorts 3080 -Action Allow`
  (旧系统用 `netsh advfirewall firewall add rule name="dsh-lan-3080" dir=in action=allow protocol=TCP localport=3080`)。
- **`autoStart`**:设置页「局域网(反代)」卡可切换,写入 `caddy/lan-state.json`,
  下次启动 dsh 生效;也可直接改 `cordis.patch.yml` 里的 `autoStart`。

## 开发

- 插件源文件即运行时文件(profile 里是符号链接),改完重启 dsh 生效。
- 验证:`curl http://127.0.0.1:3081/lan.status.json`;
  写操作需带令牌(从页面 meta `dsh-lan-token` 取):
  `curl -X POST -H 'x-lan-token: <token>' .../lan.action -d '{"action":"status"}'`。
