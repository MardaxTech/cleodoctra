(() => {
	const previewForm = document.getElementById('previewform');
	const url = new URLSearchParams(window.location.search).get('url')?.replace(/\/\/github\.com/, '//raw.githubusercontent.com').replace(/\/blob\//, '/') ?? '';
	
	if (!url && new URLSearchParams(window.location.search).get('q')) {
		const q = new URLSearchParams(window.location.search).get('q');
		window.location.href = `${window.location.origin}/?url=${localStorage.getItem('url')}&q=${q}`;
	}
	
	const replaceAssets = async () => {
		if (document.querySelectorAll('frameset').length) return;
		
		const frames = document.querySelectorAll('iframe[src],frame[src]');
		for (const frame of frames) {
			const src = frame.src;
			if (src.includes('//raw.githubusercontent.com') || src.includes('//bitbucket.org')) {
				frame.src = `//${location.hostname}:${location.port}${location.pathname}?${src}`;
			}
		}
		
		const links = document.querySelectorAll('a[href]');
		for (let i = 0; i < links.length; i++) {
			const link = links[i];
			const href = link.href;

			if (href.includes('#')) {
				link.addEventListener('click', e => {
					e.preventDefault();
					const hash = href.split('#')[1];
					const target = document.getElementById(hash);
					if (target) {
						target.scrollIntoView();
					}
				});
			} else if (href.includes("githubusercontent")) {
				link.addEventListener('click', e => {
					e.preventDefault();
					const url = new URL(window.location.href);
					url.searchParams.set('url', href);
					url.searchParams.delete('p');
					window.history.replaceState({}, '', url.toString());
					location.href = url.toString();
				});
			}
		}
		
		const linkEls = document.querySelectorAll('link[rel=stylesheet]');
		const linkPromises = Array.from(linkEls).map(link => fetchPassthru(link.href));
		const linkResponses = await Promise.all(linkPromises);
		for (const response of linkResponses) {
			loadCSS(response);
		}
		
		const scriptEls = document.querySelectorAll('script[type="text/htmlpreview"]');
		const scriptPromises = Array.from(scriptEls).map(script => {
			const src = script.src;
			if (src.includes('//raw.githubusercontent.com') || src.includes('//bitbucket.org')) {
				return fetchPassthru(src).then(response => response.text);
			} else {
				script.removeAttribute('type');
				return Promise.resolve(script.innerHTML);
			}
		});
		const scriptResponses = await Promise.all(scriptPromises);
		for (const response of scriptResponses) {
			loadJS(response);
		}

		const q = new URLSearchParams(window.location.search).get('q');
		if (q) {
			const inputs = document.querySelectorAll('input[name="q"]');
			for (const input of inputs) {
				input.value = q;
			}
		}

		const forms = document.querySelectorAll('form');
		for (const form of forms) {
			form.addEventListener('submit', e => {
				e.preventDefault();
				const q = form.querySelector('input[name="q"]').value;
				const search = new URL(window.location.href);
				if (form.action != location.href) search.searchParams.set('url', form.action);
				search.searchParams.set('q', q);
				window.history.replaceState({}, '', search.toString());
				window.location.reload();
			});
		}
		
		document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
	};
	
	const loadHTML = data => {
		if (data) {
			const base = `<base href="${url}">`;
			const html = data.text.replace(/<head([^>]*)>/i, `<head$1>${base}`);
			document.open();
			document.write(html);
			document.close();
			addEventListener('DOMContentLoaded', () => {
				replaceAssets();
				localStorage.setItem('url', url);
			}, { once: true });
		}
	};
	
	const loadCSS = data => {
		if (data) {
			let css = data.text;
			if (css.includes('@import url')) {
				const folder = new URL(data.url).pathname.split('/').slice(0, -1).join('/');
				css = css.replace(/@import url\(([^)]+)\);/g, (match, p1) => {
					p1 = p1.replace(/['"]/g, '');
					return `@import url("${new URL(url).origin}/${folder}/${p1}");`;
				});
			}
			const style = document.createElement('style');
			style.innerHTML = css;
			document.head.appendChild(style);
		}
	};
	
	const loadJS = data => {
		if (data) {
			const script = document.createElement('script');
			script.innerHTML = data;
			document.body.appendChild(script);
		}
	};
	
	const fetchPassthru = async resource => {
		const resourceComponents = resource.split('/');
		if (resource.includes('github')) {
			resource = `https://api.github.com/repos/${resourceComponents[3]}/${resourceComponents[4]}/contents/${resourceComponents.slice(6).join('/')}?ref=${resourceComponents[5]}`;
		}
		try {
			const res = await fetch(resource, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem('accessToken')}`
				},
			});
			if (!res.ok) throw new Error(`Cannot load ${resource}: ${res.status} ${res.statusText}`);
			const base64Content = (await res.json()).content;
			const content = decodeURIComponent(escape(atob(base64Content)));

			return {
				url: res.url,
				text: content
			};
		} catch (error) {
			alert(error.message);

			location.href = `${location.origin}`;
		}
	};
	
	if (url && !url.includes(location.hostname)) {
		fetchPassthru(url).then(loadHTML).catch(error => {
			console.error(error);
			previewForm.style.display = 'block';
			previewForm.innerText = error;
		});
	} else {
		previewForm.style.display = 'block';
	}
})();
