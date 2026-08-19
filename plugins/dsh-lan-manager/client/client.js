window.__ModuleLoader__.load({
	id: "dsh-lan-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react = require("react");

		const h = react.createElement;

		// ── styles ──────────────────────────────────────────────────────────
		const css = [
			".dslm-wrap{display:flex;flex-direction:column;gap:12px}",
			".dslm-card{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}",
			".dslm-head{display:flex;align-items:center;gap:8px}",
			".dslm-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary,#222);flex:1}",
			".dslm-dot{width:8px;height:8px;border-radius:50%;flex:none}",
			".dslm-dot.ok{background:#22c55e}.dslm-dot.bad{background:#ef4444}.dslm-dot.na{background:#9ca3af}",
			".dslm-row{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222);min-height:20px}",
			".dslm-detail{color:var(--dsw-alias-label-secondary,#666);font-size:12px;word-break:break-all;flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dslm-actions{display:flex;flex-wrap:wrap;gap:8px}",
			".dslm-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));color:var(--dsw-alias-label-primary,#222);border-radius:8px;padding:5px 12px;font-size:13px;font-family:inherit}",
			".dslm-btn:hover{filter:brightness(.96)}",
			".dslm-btn.primary{background:var(--dsw-specific-accent,#3b82f6);border-color:transparent;color:#fff}",
			".dslm-btn:disabled{opacity:.55;cursor:not-allowed}",
			".dslm-msg{font-size:12px;color:var(--dsw-alias-label-secondary,#666);min-height:16px}",
			".dslm-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:rgba(128,128,128,.1);border-radius:6px;padding:2px 6px;word-break:break-all;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dslm-copy{font-size:11px;cursor:pointer;border:none;background:none;color:var(--dsw-specific-accent,#3b82f6);text-decoration:underline;padding:0;flex:none}",
			".dslm-link{font-size:12px;color:var(--dsw-specific-accent,#3b82f6);text-decoration:none}",
			".dslm-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:var(--dsw-mask-blur,blur(2px));z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px}",
			".dslm-panel{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));border-radius:16px;box-shadow:var(--dsw-shadow-lv3,0 8px 30px rgba(0,0,0,.2));width:min(600px,100%);max-height:82vh;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px}",
			".dslm-panel h3{margin:0;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#222)}",
			".dslm-step{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222)}",
			".dslm-cmd{display:flex;align-items:center;gap:8px;background:rgba(128,128,128,.08);border-radius:8px;padding:6px 10px}",
			".dslm-cmd code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;flex:1;word-break:break-all;color:var(--dsw-alias-label-primary,#222)}",
			".dslm-switch{position:relative;width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;background:rgba(128,128,128,.32);transition:background .15s;flex:none;padding:0}",
			".dslm-switch.on{background:var(--dsw-specific-accent,#3b82f6)}",
			".dslm-switch::after{content:\"\";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}",
			".dslm-switch.on::after{left:18px}",
			".dslm-switch:disabled{opacity:.5;cursor:not-allowed}",
			".dslm-togrow{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222);min-height:24px}",
			".dslm-togrow .dslm-hint{flex:1;text-align:right;color:var(--dsw-alias-label-secondary,#666);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		].join("\n");
		const tagId = "dsh-lan-manager/LanSection.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tagId}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-lan-manager";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		// ── helpers ─────────────────────────────────────────────────────────
		const copy = (text) => {
			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text).catch(() => {});
				} else {
					const ta = document.createElement("textarea");
					ta.value = text;
					document.body.appendChild(ta);
					ta.select();
					document.execCommand("copy");
					ta.remove();
				}
			} catch (e) {
				/* ignore */
			}
		};

		/** Per-boot action token injected into the served index page. */
		const actionToken = (() => {
			try {
				const m = document.querySelector('meta[name="dsh-lan-token"]');
				return m ? m.content : "";
			} catch (e) {
				return "";
			}
		})();

		const Card = ({ title, ok, children }) =>
			h(
				"div",
				{ className: "dslm-card" },
				h(
					"div",
					{ className: "dslm-head" },
					h("span", { className: "dslm-dot " + (ok === null || ok === undefined ? "na" : ok ? "ok" : "bad") }),
					h("div", { className: "dslm-title" }, title),
				),
				children,
			);

		const Row = ({ label, ok, detail, okText }) =>
			h(
				"div",
				{ className: "dslm-row" },
				h("span", null, label),
				h(
					"span",
					{ className: "dslm-detail" },
					ok === null || ok === undefined ? "检测中…" : ok ? okText || "正常" : detail || "异常",
				),
			);

		/** Pill-shaped toggle switch. */
		const Switch = ({ on, disabled, onChange }) =>
			h("button", {
				className: "dslm-switch" + (on ? " on" : ""),
				disabled: disabled,
				onClick: onChange,
				role: "switch",
				"aria-checked": !!on,
				title: on ? "已开启" : "已关闭",
			});

		const ToggleRow = ({ label, on, disabled, onChange, hint }) =>
			h(
				"div",
				{ className: "dslm-togrow" },
				h("span", null, label),
				h("span", { className: "dslm-hint" }, hint || (on ? "已开启" : "已关闭")),
				h(Switch, { on, disabled, onChange }),
			);

		const UrlRow = ({ label, value }) =>
			h(
				"div",
				{ className: "dslm-row" },
				h("span", { className: "dslm-detail", style: { textAlign: "left", flex: "0 0 auto", maxWidth: "30%" } }, label),
				h("span", { className: "dslm-code" }, value || "—"),
				value ? h("button", { className: "dslm-copy", onClick: () => copy(value) }, "复制") : null,
			);

		const Actions = ({ busy, items }) =>
			h(
				"div",
				{ className: "dslm-actions" },
				items.map((it) =>
					h(
						"button",
						{
							key: it.label,
							className: "dslm-btn" + (it.primary ? " primary" : ""),
							disabled: busy,
							onClick: () => it.onClick(),
						},
						it.label,
					),
				),
			);

		const CmdRow = ({ cmd }) =>
			h(
				"div",
				{ className: "dslm-cmd" },
				h("code", null, cmd),
				h("button", { className: "dslm-copy", onClick: () => copy(cmd) }, "复制"),
			);

		const Modal = ({ title, onClose, children }) =>
			h(
				"div",
				{ className: "dslm-mask", onClick: onClose },
				h(
					"div",
					{ className: "dslm-panel", onClick: (e) => e.stopPropagation() },
					h("div", { className: "dslm-head" }, h("div", { className: "dslm-title" }, title)),
					children,
					h(
						"div",
						{ className: "dslm-actions" },
						h("button", { className: "dslm-btn", onClick: onClose }, "关闭"),
					),
				),
			);

		// ── section ─────────────────────────────────────────────────────────
		function LanSection() {
			const [st, setSt] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [msg, setMsg] = react.useState("");
			const [modal, setModal] = react.useState(null);

			const [updated, setUpdated] = react.useState("");
			const refresh = react.useCallback(() => {
				fetch("/lan.status.json", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						setSt(d);
						try {
							setUpdated(new Date().toLocaleTimeString());
						} catch (e) {
							/* ignore */
						}
					})
					.catch(() => setSt({ error: true }));
			}, []);

			react.useEffect(() => {
				refresh();
				// Async refresh — the page never blocks on detection.
				const t = setInterval(refresh, 10000);
				return () => clearInterval(t);
			}, [refresh]);

			const act = react.useCallback(
				(action, extra) => {
					setBusy(true);
					setMsg("执行中…");
					fetch("/lan.action", {
						method: "POST",
						headers: {
							"content-type": "application/json",
							...(actionToken ? { "x-lan-token": actionToken } : {}),
						},
						body: JSON.stringify(Object.assign({ action }, extra || {})),
					})
						.then((r) => r.json())
						.then((d) => {
							if (d && d.status === 401) setMsg("未授权:页面令牌缺失或已过期,请刷新页面");
							else setMsg(d.message || (d.ok ? "完成" : "失败"));
							setBusy(false);
							refresh();
						})
						.catch((e) => {
							setMsg("请求失败: " + e.message);
							setBusy(false);
						});
				},
				[refresh],
			);

			if (!st) {
				// Render the page immediately — status arrives async and rows
				// show 检测中… until then.
				return h(
					"div",
					{ className: "dslm-wrap" },
					h("div", { className: "dslm-msg" }, "正在检测…"),
					h(Card, { title: "局域网(反代)", ok: null }, h(Row, { label: "反代运行中", ok: null })),
					h(Card, { title: "Tailscale", ok: null }, h(Row, { label: "已连接", ok: null })),
					h(Card, { title: "证书安装提示", ok: null }, h(Row, { label: "当前状态", ok: null })),
				);
			}
			if (st.error) {
				return h(
					"div",
					{ className: "dslm-wrap" },
					h("div", { className: "dslm-msg" }, "无法读取 /lan.status.json"),
					h("div", { className: "dslm-actions" }, h("button", { className: "dslm-btn", onClick: refresh }, "重试")),
				);
			}

			const c = st.checks || {};
			const cert = st.cert || {};
			const ts = c.tailscale || {};
			const notice = st.certNotice || {};

			return h(
				"div",
				{ className: "dslm-wrap" },
				h(
					"div",
					{ className: "dslm-msg" },
					msg || "所有操作均在此页面完成,接口不对外暴露。",
					h("button", { className: "dslm-copy", style: { marginLeft: 8 }, onClick: refresh }, "刷新"),
					updated ? h("span", { style: { marginLeft: 8 } }, "更新于 " + updated) : null,
				),

				// ── 局域网(反代) ──────────────────────────────────────────
				h(
					Card,
					{ title: "局域网(反代)", ok: c.caddy && c.caddy.running },
					Row({ label: "反代运行中", ok: c.caddy && c.caddy.running, detail: "未运行", okText: "运行中" }),
					ToggleRow({ label: "反代自启动", on: st.autoStart === true, disabled: busy, onChange: () => act("setAutoStart", { on: !(st.autoStart === true) }), hint: "dsh 启动时自动拉起反代" }),
					Row({ label: "局域网端口", ok: c.port && c.port.lan, detail: "不可达", okText: "可达" }),
					Row({ label: "证书", ok: cert.present, detail: "缺失,点「一键配置」", okText: cert.coversLanIp ? "SAN 已覆盖本机 IP" : "SAN 未覆盖当前 IP" }),
					Row({ label: "本地 CA", ok: cert.ca === "present", detail: "未生成", okText: "已生成" }),
					UrlRow({ label: "访问地址", value: st.url }),
					h(
						Actions,
						{
							busy,
							items: [
								{ label: "一键配置并启动", primary: true, onClick: () => act("autoConfig") },
								{ label: "启动", onClick: () => act("start") },
								{ label: "停止", onClick: () => act("stop") },
								{ label: "重启", onClick: () => act("restart") },
								{ label: "重新生成证书", onClick: () => act("regenCert") },
							],
						},
					),
				),

				// ── Tailscale ─────────────────────────────────────────────
				h(
					Card,
					{ title: "Tailscale", ok: ts.running },
					Row({ label: "已安装", ok: ts.installed, detail: "未安装,见 README" }),
					Row({ label: "已连接", ok: ts.running, detail: "未连接", okText: ts.dnsName || "已连接" }),
					ToggleRow({ label: "Tailscale 自启动", on: st.tailscaleAutoStart === true, disabled: busy, onChange: () => act("setTailscaleAutoStart", { on: !(st.tailscaleAutoStart === true) }), hint: "dsh 启动时自动连接" }),
					Row({ label: "Serve", ok: ts.serve && ts.serve !== "off" && ts.serve !== "unknown" ? true : ts.serve === "off" ? false : null, detail: "未开启,点「Serve 开」后域名免证书", okText: "已开启" }),
					Row({ label: "tailnet 端口", ok: c.port && c.port.tailnet, detail: "不可达(需 CA 或走 serve)", okText: "可达" }),
					UrlRow({ label: "域名地址", value: ts.serveUrl || (ts.dnsName ? "https://" + ts.dnsName + "/" : "") }),
					UrlRow({ label: "IP 地址", value: ts.tailnetIPs && ts.tailnetIPs[0] ? "https://" + ts.tailnetIPs[0] + ":" + st.port + "/" : "" }),
					h(
						Actions,
						{
							busy,
							items: [
								{ label: "连接", onClick: () => act("tailscaleUp") },
								{ label: "断开", onClick: () => act("tailscaleDown") },
								{ label: "Serve 开", onClick: () => act("tailscaleServe", { serveOn: true }) },
								{ label: "Serve 关", onClick: () => act("tailscaleServe", { serveOn: false }) },
								{ label: "Funnel 开", onClick: () => act("tailscaleFunnel", { funnelOn: true }) },
								{ label: "Funnel 关", onClick: () => act("tailscaleFunnel", { funnelOn: false }) },
								{ label: "安装/授权流程", onClick: () => setModal("ts") },
							],
						},
					),
				),

				// ── 证书安装提示(检测 + 安装 + 开关) ─────────────────────
				h(
					Card,
					{ title: "证书安装提示", ok: notice.enabled },
					Row({ label: "检测(SAN/mDNS)", ok: cert.present && st.mdns, detail: "mDNS 未运行或证书缺失", okText: "正常" }),
					ToggleRow({ label: "页面提示开关", on: notice.enabled === true, disabled: busy, onChange: () => act("setCertNotice", { on: !(notice.enabled === true) }), hint: "设备未装 CA 时页面底部提示" }),
					h(
						"div",
						{ className: "dslm-actions" },
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => setModal("ca") }, "安装流程"),
						h("a", { className: "dslm-link", href: "/ca.crt", target: "_blank", rel: "noreferrer" }, "下载 CA 证书"),
					),
				),

				// ── 弹窗 ─────────────────────────────────────────────────
				modal === "ts"
					? h(
							Modal,
							{ title: "Tailscale 安装与授权", onClose: () => setModal(null) },
							h("div", { className: "dslm-step" }, "1. 安装(需要 sudo):"),
							h(CmdRow, { cmd: "curl -fsSL https://tailscale.com/install.sh | sh" }),
							h("div", { className: "dslm-step" }, "2. 登录并授权当前用户(会打印登录链接,浏览器认证一次,之后无需 sudo):"),
							h(CmdRow, { cmd: "sudo tailscale up --operator=$USER" }),
							h("div", { className: "dslm-step" }, "3. 开放 dsh(serve 模式,公网受信证书,设备零安装零警告):"),
							h(CmdRow, { cmd: "tailscale serve --bg --https=443 3081" }),
							h("div", { className: "dslm-step" }, "4. (可选)公开到公网:"),
							h(CmdRow, { cmd: "tailscale funnel 3080" }),
							h("div", { className: "dslm-step" }, "完成后点「连接」刷新状态;访问地址见上方「域名地址」。"),
						)
					: null,
				modal === "ca"
					? h(
							Modal,
							{ title: "CA 证书安装流程", onClose: () => setModal(null) },
							h("div", { className: "dslm-step" }, "① 先下载证书(或让设备直接访问本页的 /ca.crt):"),
							h(CmdRow, { cmd: "https://" + (st.lanIp || "") + ":" + st.port + "/ca.crt" }),
							h("div", { className: "dslm-step" }, "② 按设备安装:"),
							h("div", { className: "dslm-step" }, "Windows:双击 ca.crt → 安装证书 → 本地计算机 → 受信任的根证书颁发机构"),
							h("div", { className: "dslm-step" }, "macOS:双击 → 钥匙串「系统」→ 信任设为「始终信任」"),
							h("div", { className: "dslm-step" }, "iPhone/iPad:Safari 打开上方链接 → 设置 → VPN 与设备管理 → 安装 → 证书信任设置里打开开关"),
							h("div", { className: "dslm-step" }, "Android:设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书"),
							h("div", { className: "dslm-step" }, "Linux:复制到 /usr/local/share/ca-certificates/ 后 update-ca-certificates(Firefox 需另导入)"),
							h("div", { className: "dslm-step" }, "装完后刷新页面,提示自动消失(也可在下方直接关掉提示功能)。"),
						)
					: null,
			);
		}

		// ── cordis client entry ─────────────────────────────────────────────
		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "lan",
						order: 100,
						label: () => "远程访问",
						children: { "settings.lan.item": { kind: "list", scope: "root" } },
					},
					LanSection,
				),
			);
		}

		exports.name = "dsh-lan-manager";
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
