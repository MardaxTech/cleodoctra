<script lang="ts">
	// import libaries
	import { initializeApp } from 'firebase/app';
	import {
		GithubAuthProvider,
		getAuth,
		signInWithPopup,
		signOut,
		type User,
		onAuthStateChanged
	} from 'firebase/auth';
	import { getFirestore, doc, getDoc } from 'firebase/firestore';
	import { onMount } from 'svelte';

	// initialize firebase
	const firebaseConfig = {
		apiKey: "AIzaSyDRlsx97DcVK3FhK_3-DvMdzO244pRHNUk",
		authDomain: "cleodoctra--dev.firebaseapp.com",
		projectId: "cleodoctra--dev",
		storageBucket: "cleodoctra--dev.appspot.com",
		messagingSenderId: "590546774673",
		appId: "1:590546774673:web:d984f3a2045b19a9f1ed30"
	};

	initializeApp(firebaseConfig);

	// setup auth provider
	const githubAuhProviderInstance = new GithubAuthProvider();
	// add scopes to auth provider
	githubAuhProviderInstance.addScope('repo');
	githubAuhProviderInstance.addScope('read:org');

	const documentationBranches = ["gh-pages"] // branches that should be included in the list of documentation pages

	let organisations: Set<string> = new Set(); // Organisations that the app has access to
	let userInfo: null | User = null; // User info from firebase auth
	let currentRemoteFileUrl: string | null = null; // The url of the remote file to preview
	let githubAccessToken: string | null = null; // The github access token

	let repositories: any = {}; // List of repositories that contain documentation

	let hideSignin = false; // Whether to hide the signin menu
	let reposFullyScanned = false; // Whether all repositories have been scanned
	let mounted = false; // Whether the component has been mounted

	// Sign the user in with github if they are not already signed in or the access token has expired
	async function signinWithGithub() {
		userInfo = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') ?? '{}') : null;
		githubAccessToken = localStorage.getItem('accessToken') ?? '';

		if (parseInt(localStorage.getItem('expiresIn') ?? '0') > Date.now() && userInfo && githubAccessToken) {
			console.log('User already signed in');
		} else {
			const result = await signInWithPopup(getAuth(), githubAuhProviderInstance);
			userInfo = result.user;
			githubAccessToken = GithubAuthProvider.credentialFromResult(result)?.accessToken ?? '';

			localStorage.setItem('accessToken', githubAccessToken);
			localStorage.setItem('user', JSON.stringify(userInfo));
			localStorage.setItem('expiresIn', Date.now() + 3600000 + '');
			loadRepos();
		}
	}

	// Load the repositories that the app has access to
	async function loadRepos() {
		if (currentRemoteFileUrl) return;
		try {
			const repositoriesResponse = await fetch('https://api.github.com/user/repos', {
				headers: {
					Authorization: `Bearer ${githubAccessToken}`,
					Accept: 'application/vnd.github+json'
				}
			});

			// list of repositories that the app has access to
			const repositoriesData = await repositoriesResponse.json();

			for (let i = 0; i < repositoriesData.length; i++) {
				const repository = repositoriesData[i];
				const branches = await fetch(repository.branches_url.replace('{/branch}', ''), {
					headers: {
						Authorization: `token ${githubAccessToken}`
					}
				});

				// list of branches in the repository
				if (branches.ok) {
					// if the repository has one or more documentation branches
					const availableDocumentationBranches = (await branches.json()).filter((branch: any) => documentationBranches.includes(branch.name));
					if (availableDocumentationBranches.length != 0) {
						for (let i = 0; i < availableDocumentationBranches.length; i++) {
							const branch = availableDocumentationBranches[i];

							const branchResponse = await fetch(
								repository.trees_url.replace('{/sha}', `/${branch.name}?recursive=1`), {
									headers: {
										Authorization: `token ${githubAccessToken}`
									}
								}
							);

							if (branchResponse.ok) {
								// list of files in the branch
								const files = await branchResponse.json();
								let indexes = files.tree.filter((file: any) => file.path == 'index.html' || file.path.includes('/index.html'));
								if (repository.name == "test") console.log(indexes)
								if (indexes.length > 0) {
									for (let i = 0; i < indexes.length; i++) {
										const index = indexes[i];
										const path = index.path;

										organisations.add(repository.owner.login); // add the organisation to the list of organisations that the app has access to

										// add the repository to the list of repositories that contain documentation
										repositories[repository.id + branch.name + path] = {
											name: repository.full_name + (index.length == 1 ?
												'' :
												`/${branch.name}/${path.replace('/index.html', '')}`),
											index: `${repository.html_url}/blob/${branch.name}/${path}`,
											organisation: repository.owner.login
										};
									}
								}
							}
						}
					}
				}

				// if the last repository has been scanned
				if (i == repositoriesData.length - 1) reposFullyScanned = true;
			}
		} catch (error) {
			console.error(error);
		}
	}

	onMount(() => {
		mounted = true; // The component has been mounted

		// Get the url of the remote file to preview
		const urlParams = new URLSearchParams(window.location.search);
		currentRemoteFileUrl = urlParams.get('url');

		// Get the user info and access token from local storage
		userInfo = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') ?? '{}') : null;
		githubAccessToken = localStorage.getItem('accessToken') ?? '';

		// Load the repositories if the user is already signed in
		if (userInfo && githubAccessToken) loadRepos();

		// Listen for changes in the user's authentication state
		onAuthStateChanged(getAuth(), (user) => {
			if (user) loadRepos();
		});

		// setInterval(() => {
			// if (parseInt(localStorage.getItem('expiresIn') ?? Date.now().toString()) < Date.now())
				// signinWithGithub();
		// 	if (!(!userInfo || !githubAccessToken || !getAuth().currentUser)) {
		// 		fetch('https://api.github.com/user', {
		// 			headers: {
		// 				Authorization: `token ${githubAccessToken}`
		// 			}
		// 		}).then((response) => {
		// 			if (response.status === 401) {
		// 				fullySignout();
		// 			}
		// 		}).catch(fullySignout);
		// 	}
		// }, 5000);
	});

	// Sign the user out and remove their data from local storage
	function fullySignout() {
		signOut(getAuth());
		localStorage.removeItem('user');
		localStorage.removeItem('accessToken');
		localStorage.removeItem('expiresIn');
		userInfo = null;
		githubAccessToken = null;
	}

	let clientId = ""; // Set the client id to an empty string or the default value
	const db = getFirestore(); // Get the database instance
	const docRef = doc(db, 'config', 'github'); // Get the document reference

	// Get the client id from the database
	getDoc(docRef).then((document) => {
		if (document.exists()) clientId = document.data().clientId ?? clientId;
	});

</script>

<div id="wrapper">
	{#if !userInfo && currentRemoteFileUrl == null && mounted && !hideSignin}
		<button on:click={signinWithGithub} id="githubSignin">
			<img src="/github.svg" alt="Github Logo" />
			<p>Sign in with Github</p>
		</button>
	{:else if (userInfo && currentRemoteFileUrl == null && mounted) || hideSignin}
		<div id="menu">
			<div id="topbar">
				<h1>Welcome {userInfo?.displayName}</h1>
				<button
					id="signout"
					on:click={fullySignout}>
					<img src="/signout.png" alt="Github Logo" />
				</button>
			</div>
			{#if reposFullyScanned}
				<p>
					Access to projects from{' '}
					{#each organisations.values() as org, i}
						{#if i != 0 && i != organisations.size - 1},{' '}{/if}
						{#if i == organisations.size - 1}and{' '}{/if}
						{org}
					{/each}
				</p>
				<a href="https://github.com/settings/connections/applications/{clientId}">Manage access</a>
				<br>
			{/if}

			{#if !reposFullyScanned}
				<p>Loading projects...</p>
			{/if}

			<div id="projects">
				{#if reposFullyScanned}
					{#each Object.keys(repositories) as id}
						<button
							class="project"
							on:click={() => {
								location.href = '/?url=' + repositories[id].index;
							}}>
							{repositories[id].name}
						</button>
					{/each}
				{/if}
			</div>
			{#if Object.keys(repositories).length == 0}
				{#if reposFullyScanned}
					<p>Unable to find projects containing an index.html.</p>
					<br />
					<button
						id="retry"
						on:click={async () => {
							hideSignin = true;
							fullySignout()
							await signinWithGithub();
							reposFullyScanned = false;
						}}>
						Retry
					</button>
				{/if}
			{/if}
			<div id="previewform" />
		</div>
	{/if}
	<script src="/htmlpreview.js"></script>
</div>

<style lang="scss">
	@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap');

	:global(html) {
		scroll-behavior: smooth;
		font-family: 'Poppins', sans-serif;
	}

	#wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 25vh;
	}

	#githubSignin {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #000;
		color: #fff;
		border: none;
		border-radius: 5px;
		padding: 10px;
		cursor: pointer;
	}

	#githubSignin img {
		width: 40px;
		margin-right: 10px;
		filter: invert(1);
	}

	#githubSignin p {
		font-size: 1rem;
		font-weight: 500;
	}

	#menu {
		width: 90%;
		height: 100%;
		display: flex;
		flex-direction: column;

		#topbar {
			display: flex;
			align-items: center;
			justify-content: space-between;

			h1 {
				font-size: 2.5rem;
				font-weight: 700;
			}

			#signout {
				cursor: pointer;
				outline: none;
				border: none;
				background-color: transparent;

				img {
					height: 3rem;
				}
			}
		}

		#projects {
			display: flex;
			flex-wrap: wrap;
			justify-content: center;
			margin-bottom: 20px;

			.project {
				background-color: #000;
				color: #fff;
				border: none;
				border-radius: 5px;
				padding: 10px;
				cursor: pointer;
				margin: 5px;
				font-size: 1rem;
				font-weight: 500;
			}

			p {
				text-align: left;
				width: 100%;
				margin-top: 1.5rem;
			}
		}

		#retry {
			background-color: #000;
			color: #fff;
			border: none;
			border-radius: 5px;
			padding: 10px;
			cursor: pointer;
			font-size: 1rem;
			font-weight: 500;
		}

		p {
			font-size: 1rem;
			font-weight: 400;
			margin: 0;
		}
	}
</style>
