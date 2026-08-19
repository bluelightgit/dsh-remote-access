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
					ok === null || ok === undefined ? "未知" : ok ? okText || "正常" : detail || "异常",
				),
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
			const notice = st.certNotice || {};

			return h(
				"div",
				{ className: "dslm-wrap" },
				h("div", { className: "dslm-msg" }, msg || "所有操作均在此页面完成,接口不对外暴露。"),

				// ── 局域网(反代) ──────────────────────────────────────────
				h(
					Card,
					{ title: "局域网(反代)", ok: c.caddy && c.caddy.running },
					Row({ label: "反代运行中", ok: c.caddy && c.caddy.running, detail: "未运行", okText: "运行中" }),
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
							],
						},
					),
				),

				// ── 证书安装提示(检测 + 安装 + 开关) ─────────────────────
				h(
					Card,
					{ title: "证书安装提示", ok: notice.enabled },
					Row({ label: "检测(SAN/mDNS)", ok: cert.present && st.mdns, detail: "mDNS 未运行或证书缺失", okText: "正常" }),
					Row({ label: "当前状态", ok: notice.enabled, detail: "已关闭(默认)", okText: "已开启" }),
					h(
						"div",
						{ className: "dslm-actions" },
						h("button", { className: "dslm-btn primary", disabled: busy, onClick: () => act("setCertNotice", { on: !notice.enabled }) }, notice.enabled ? "关闭提示" : "开启提示"),
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
