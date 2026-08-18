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
			".dslm-wrap{display:flex;flex-direction:column;gap:14px}",
			".dslm-card{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}",
			".dslm-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary,#222)}",
			".dslm-row{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222)}",
			".dslm-dot{width:8px;height:8px;border-radius:50%;flex:none}",
			".dslm-dot.ok{background:#22c55e}.dslm-dot.bad{background:#ef4444}.dslm-dot.na{background:#9ca3af}",
			".dslm-detail{color:var(--dsw-alias-label-secondary,#666);font-size:12px;word-break:break-all}",
			".dslm-actions{display:flex;flex-wrap:wrap;gap:8px}",
			".dslm-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));color:var(--dsw-alias-label-primary,#222);border-radius:8px;padding:5px 12px;font-size:13px;font-family:inherit}",
			".dslm-btn:hover{filter:brightness(.96)}",
			".dslm-btn.primary{background:var(--dsw-specific-accent,#3b82f6);border-color:transparent;color:#fff}",
			".dslm-btn.danger{color:#dc2626}",
			".dslm-btn:disabled{opacity:.55;cursor:not-allowed}",
			".dslm-msg{font-size:12px;color:var(--dsw-alias-label-secondary,#666)}",
			".dslm-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:rgba(128,128,128,.1);border-radius:6px;padding:2px 6px;word-break:break-all}",
			".dslm-copy{font-size:11px;cursor:pointer;border:none;background:none;color:var(--dsw-specific-accent,#3b82f6);text-decoration:underline;padding:0}",
			".dslm-link{font-size:12px;color:var(--dsw-specific-accent,#3b82f6);text-decoration:none}",
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

		const StatusRow = ({ label, ok, detail, okText }) =>
			h(
				"div",
				{ className: "dslm-row" },
				h("span", {
					className: "dslm-dot " + (ok === null || ok === undefined ? "na" : ok ? "ok" : "bad"),
				}),
				h("span", null, label),
				h(
					"span",
					{ className: "dslm-detail" },
					ok === null || ok === undefined ? "未知" : ok ? okText || "正常" : detail || "异常",
				),
			);

		const UrlRow = ({ label, value }) =>
			h(
				"div",
				{ className: "dslm-row" },
				h("span", { className: "dslm-detail" }, label),
				h("span", { className: "dslm-code" }, value || "—"),
				value
					? h("button", { className: "dslm-copy", onClick: () => copy(value) }, "复制")
					: null,
			);

		// ── section ─────────────────────────────────────────────────────────
		function LanSection() {
			const [st, setSt] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [msg, setMsg] = react.useState("");

			const refresh = react.useCallback(() => {
				fetch("/lan.status.json", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => setSt(d))
					.catch(() => setSt({ error: true }));
			}, []);

			react.useEffect(() => {
				refresh();
			}, [refresh]);

			const act = react.useCallback(
				(action, extra) => {
					setBusy(true);
					setMsg("执行中…");
					fetch("/lan.action", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(Object.assign({ action }, extra || {})),
					})
						.then((r) => r.json())
						.then((d) => {
							setMsg(d.message || (d.ok ? "完成" : "失败"));
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
				return h("div", { className: "dslm-wrap" }, h("div", { className: "dslm-msg" }, "加载状态中…"));
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

			return h(
				"div",
				{ className: "dslm-wrap" },
				// 访问地址
				h(
					"div",
					{ className: "dslm-card" },
					h("div", { className: "dslm-title" }, "访问地址"),
					UrlRow({ label: "局域网", value: st.url }),
					UrlRow({ label: "Tailscale 域名(免证书)", value: ts.serveUrl || (ts.dnsName ? "https://" + ts.dnsName + "/" : "") }),
					UrlRow({ label: "Tailscale IP", value: ts.tailnetIPs && ts.tailnetIPs[0] ? "https://" + ts.tailnetIPs[0] + ":" + st.port + "/" : "" }),
				),
				// 状态检查
				h(
					"div",
					{ className: "dslm-card" },
					h("div", { className: "dslm-title" }, "状态检查"),
					StatusRow({ label: "Caddy 已安装", ok: c.caddy && c.caddy.installed, detail: "未找到 caddy,请先安装", okText: c.caddy && c.caddy.path }),
					StatusRow({ label: "反代配置", ok: c.caddy && c.caddy.configPresent, detail: "缺少 Caddyfile,点下方「一键配置」", okText: "Caddyfile 就绪" }),
					StatusRow({ label: "反代运行中", ok: c.caddy && c.caddy.running, detail: "未运行", okText: "运行中" }),
					StatusRow({ label: "局域网端口", ok: c.port && c.port.lan, detail: "不可达", okText: "可达" }),
					StatusRow({ label: "Tailscale 端口", ok: c.port && c.port.tailnet, detail: "不可达(需 CA 或走 serve)", okText: "可达" }),
					StatusRow({ label: "证书", ok: cert.present, detail: "缺失,点「一键配置」", okText: "SAN 覆盖局域网: " + (cert.coversLanIp ? "是" : "否") }),
					StatusRow({ label: "本地 CA", ok: cert.ca === "present", detail: "未生成", okText: "已生成(设备安装 ca.crt 后免警告)" }),
					StatusRow({ label: "Tailscale 已安装", ok: ts.installed, detail: "未安装: curl -fsSL https://tailscale.com/install.sh | sh" }),
					StatusRow({ label: "Tailscale 已连接", ok: ts.running, detail: "未连接,点下方「连接」", okText: ts.dnsName || "已连接" }),
					StatusRow({ label: "Tailscale Serve", ok: ts.serve && ts.serve !== "off" && ts.serve !== "unknown" ? true : ts.serve === "off" ? false : null, detail: "未开启,点「Serve 开」后访问域名免证书", okText: "已开启" }),
					StatusRow({ label: "mDNS(avahi)", ok: st.mdns, detail: "未运行,横幅检测不可用", okText: "正常" }),
					StatusRow({ label: "证书安装提示", ok: st.certNotice && st.certNotice.enabled, detail: "已关闭(默认)", okText: "已开启" }),
				),
				// 操作
				h(
					"div",
					{ className: "dslm-card" },
					h("div", { className: "dslm-title" }, "操作"),
					h(
						"div",
						{ className: "dslm-actions" },
						h("button", { className: "dslm-btn primary", disabled: busy, onClick: () => act("autoConfig") }, "一键配置并启动"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("start") }, "启动反代"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("stop") }, "停止反代"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("restart") }, "重启反代"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("regenCert") }, "重新生成证书"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("setCertNotice", { on: !(st.certNotice && st.certNotice.enabled) }) }, "证书提示 " + (st.certNotice && st.certNotice.enabled ? "关" : "开")),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("tailscaleUp") }, "Tailscale 连接"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("tailscaleDown") }, "Tailscale 断开"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("tailscaleServe", { serveOn: true }) }, "Serve 开"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("tailscaleServe", { serveOn: false }) }, "Serve 关"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("tailscaleFunnel", { funnelOn: true }) }, "Funnel 开"),
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("tailscaleFunnel", { funnelOn: false }) }, "Funnel 关"),
					),
					h("div", { className: "dslm-msg" }, msg),
					h(
						"div",
						{ className: "dslm-actions" },
						h("a", { className: "dslm-link", href: "/ca.crt", target: "_blank", rel: "noreferrer" }, "下载 CA 证书"),
						h("a", { className: "dslm-link", href: "/ca-install.html", target: "_blank", rel: "noreferrer" }, "各设备安装说明"),
					),
				),
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
