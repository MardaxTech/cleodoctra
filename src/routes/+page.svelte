<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

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
	import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
	import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
	import { onMount } from 'svelte';

	const firebaseConfig = $page.data;

	const app = initializeApp(firebaseConfig);
	const db = getFirestore(app); // Get the database instance

	// setup auth provider
	const githubAuhProviderInstance = new GithubAuthProvider();
	// add scopes to auth provider
	githubAuhProviderInstance.addScope('repo');
	githubAuhProviderInstance.addScope('read:org');

	let documentationBranches = ["gh-pages"] // branches that should be included in the list of documentation pages

	let projectLocations: Set<string> = new Set(); // Organisations that the app has access to
	let projectLocationsFound: Set<string> = new Set(); // Organisations that the app has access to
	let userInfo: null | User = null; // User info from firebase auth
	let currentRemoteFileUrl: string | null = null; // The url of the remote file to preview
	let githubAccessToken: string | null = null; // The github access token

	let repositories: any = {}; // List of repositories that contain documentation

	let hideSignin = false; // Whether to hide the signin menu
	let reposFullyScanned = false; // Whether all repositories have been scanned
	let mounted = false; // Whether the component has been mounted
	let settingsOpen = false; // Whether the settings menu is open

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
			localStorage.setItem('expiresIn', Date.now() + 8600000 + '');
		}
	}

	// Load the repositories that the app has access to
	async function loadRepos() {
		documentationBranches = branches
		if (currentRemoteFileUrl) return;
		try {
			const repositoriesResponse = await fetch('https://api.github.com/user/repos', {
				headers: {
					Authorization: `Bearer ${githubAccessToken}`,
					Accept: 'application/vnd.github+json'
				}
			});

			// list of repositories that the app has access to
			let repositoriesData = await repositoriesResponse.json();

			// filter out repos where repository.owner.login is not in organisations
			repositoriesData = repositoriesData.filter((repository: any) => projectLocations.has(repository.owner.login));

			if (repositoriesData.length == 0) {
				reposFullyScanned = true;
				toggleSettings(true);
			}

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
					const availableBranches = await branches.json()
					for (let i = 0; i < availableBranches.length; i++) {
						const branch = availableBranches[i];

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
							if (indexes.length > 0) {
								for (let i = 0; i < indexes.length; i++) {
									const index = indexes[i];
									const path = index.path;

									projectLocationsFound.add(repository.owner.login); // add the organisation to the list of organisations that the app has access to

									projectLocationsFound = new Set([...projectLocations].sort()); // sort the organisations alphabetically

									// add the repository to the list of repositories that contain documentation
									repositories[repository.id + branch.name + path] = {
										index: `${repository.html_url}/blob/${branch.name}/${path}`,
										organisation: repository.owner.login,
										repository: repository.name,
										branch: branch.name,
										path: path.replace('/index.html', '')
									};
								}
							}
						}
					}
				} else {
					fullySignout();
				}

				// if the last repository has been scanned
				if (i == repositoriesData.length - 1) {
					reposFullyScanned = true;
					const loading = document.getElementById('loading');
					if (loading) loading.innerHTML = '';
				}
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
		// if (userInfo && githubAccessToken) loadRepos();

		if ($page.data.reCaptchaSiteKey) {
			initializeAppCheck(app, {
				provider: new ReCaptchaV3Provider(firebaseConfig.reCaptchaSiteKey),
				isTokenAutoRefreshEnabled: true
			});
		}

		// Listen for changes in the user's authentication state
		onAuthStateChanged(getAuth(), (user) => {
			if (user) {
				userInfo = user as User;
                const uid = user.uid;

                const docRef = doc(db, "users", uid);
                getDoc(docRef).then((doc) => {
                    if (doc.exists()) {
                        const data = doc.data();
                        branches = data.branches
						projectLocations = new Set(data.locations)
                    } else {
                        setDoc(docRef, {
                            branches: branches.length > 0 ? branches : ["gh-pages"]
                        });

						branches = ["gh-pages"];
                    }

					documentationBranches = branches;

					loadRepos();
                })
			}
		});

		const docRef = doc(db, 'config', 'github'); // Get the document reference

		// Get the client id from the database
		getDoc(docRef).then((document) => {
			if (document.exists()) clientId = document.data().clientId ?? clientId;
		});

		setInterval(() => {
			if (getAuth().currentUser && parseInt(localStorage.getItem('expiresIn') ?? Date.now().toString()) < Date.now())
				fullySignout().then(() => signinWithGithub());
			if (!(!userInfo || !githubAccessToken || !getAuth().currentUser)) {
				fetch('https://api.github.com/user', {
					headers: {
						Authorization: `token ${githubAccessToken}`
					}
				}).then((response) => {
					if (response.status === 401) {
						fullySignout();
					}
				}).catch(fullySignout);
			}
		}, 5000);
	});

	// Sign the user out and remove their data from local storage
	async function fullySignout() {
		await signOut(getAuth());
		localStorage.removeItem('user');
		localStorage.removeItem('accessToken');
		localStorage.removeItem('expiresIn');
		userInfo = null;
		githubAccessToken = null;
	}

	let clientId = ""; // Set the client id to an empty string or the default value

	let branches: string[] = []

	function addBranch() {
		if (branchInput == "") {
			alert("Please enter a branch name")
			return
		}

		branches = [...branches, branchInput]
		branchInput = ""

		updateFirestore()
	}

	function deleteBranch(index: number) {
		branches.splice(index, 1)
		branches = branches

		updateFirestore()
	}

	function updateFirestore() {
		const uid = userInfo!.uid;
		const docRef = doc(db, "users", uid);
		setDoc(docRef, {
			branches: branches,
			locations: [...projectLocations]
		});
	}

	let branchInput = "";
	let locationInput = "";

	function addLocation() {
		if (locationInput == "") {
			alert("Please enter a location")
			return
		}

		projectLocations.add(locationInput)
		projectLocations = new Set([...projectLocations].sort());
		locationInput = ""

		reposFullyScanned = false;

		updateFirestore()
		loadRepos()
	}

	function deleteLocation(index: number) {
		projectLocations.delete([...projectLocations][index])
		projectLocations = new Set([...projectLocations].sort());
		reposFullyScanned = false;

		reposFullyScanned = false;
		repositories = {};

		updateFirestore()
		if (projectLocations.size > 0) loadRepos()
		else {
			reposFullyScanned = true;
			toggleSettings(true);
		}
	}

	function toggleSettings(state: boolean | null = null) {
		settingsOpen = state ?? !settingsOpen;
		documentationBranches = branches
	}

</script>

<div id="wrapper">
	<a href="https://www.microbitdesign.com/" id="logo">
		<img src="/logo.svg" alt="Microbitdesign Logo" />
	</a>
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
			{#if (projectLocations.size == 0 && reposFullyScanned)}
				<p class="warn">⚠️The list of locations the application will search for documentation is empty</p>
			{/if}
			<p id="accessText">
				This application is looking for documentation in the following accounts:{' '} <br>
				{#each projectLocationsFound.values() as org, i}
					{#if i != 0 && i != projectLocationsFound.size - 1},{' '}{/if}
					{#if i == projectLocationsFound.size - 1 && projectLocationsFound.size > 1}and{' '}{/if}
					{org}
				{/each}
			</p>

			<div id="settingsButtons">
				<button id="settingsButton" on:click={() => {
					goto(`https://github.com/settings/connections/applications/${clientId}`)
				}}>🔐 Manage access</button>
				<button id="settingsButton" on:click={() => {toggleSettings()}}>⚙️ {#if !settingsOpen}Open{:else}Close{/if} settings</button>
				<button id="settingsButton" on:click={() => {
					reposFullyScanned = false;
					repositories = {};
					loadRepos();
				}}>🔄️ Reload</button>
			</div>
			<br>

			{#if !settingsOpen}
				<div id="projectWrapper">
					<div id="projects">
						{#key documentationBranches}
							{#each Object.keys(repositories).filter(
								(id) => documentationBranches.includes(repositories[id].branch)
							) as id}
								<a class="project" target="_self" href="/?url={repositories[id].index}">
									<h2>{repositories[id].repository}</h2>
									<p><b>Folder:</b> {repositories[id].path}</p>
									<p><b>Branch:</b> {repositories[id].branch}</p>
									<p><b>Account:</b> {repositories[id].organisation}</p>
								</a>
							{/each}
							{#if !reposFullyScanned}
								<div class="project" id="loadingProject">
									<img src="loading.gif" alt="loading projects">
								</div>
							{/if}
						{/key}
					</div>
					{#if Object.keys(repositories).length == 0}
						{#if reposFullyScanned}
							{#if projectLocations.size > 0}
								<p>Unable to find projects containing an index.html. Try refreshing by pressing "Reload" or updating your project locations in the settings menu</p>
							{:else if (reposFullyScanned)}
							 	<p>No project locations where specified, you can add these in the settings menu</p>
							{/if}
						{/if}
					{/if}
				</div>
			{:else}
				<div id="settingsWrapper">
					<h1>Settings</h1>
					<h2>Branches</h2>
					<p>Banches that the application will search for documentation</p>

					{#each branches as branch, i}
						<div id="branch">
							<div id="branch-name">
								<p>{branch}</p>
								<button on:click={() => {deleteBranch(i)}}>Delete</button>
							</div>
						</div>
					{/each}
					<form on:submit={addBranch} id="branch">
						<div id="branch-name">
							<input bind:value={branchInput} type="text" placeholder="Branch name">
							<input type="submit" value="Add branch">
						</div>
					</form>
					<br>
					<h2>Project locations</h2>
					<p>Locations that the application will search for documentation</p>
					{#each projectLocations as location, i}
						<div id="branch">
							<div id="branch-name">
								<p>{location}</p>
								<button on:click={() => {deleteLocation(i)}}>Delete</button>
							</div>
						</div>
					{/each}
					<form on:submit={addLocation} id="branch">
						<div id="branch-name">
							<input bind:value={locationInput} type="text" placeholder="Project location">
							<input type="submit" value="Add location">
						</div>
					</form>
				</div>
			{/if}
			<div id="previewform" />
		</div>
	{/if}
	<script src="/htmlpreview.js"></script>
</div>

<style lang="scss">
	#wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 360px;
		margin-bottom: 2rem;
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
		height: 100%;
		margin-top: 40%;
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

	#logo {
		position: absolute;
		left: 50%;
		top: 2.5%;
		transform: translate(-50%, -50%);
		max-width: 600px;
		min-height: 30px;
		width: 90%;

		img {
			width: 100%;
			height: 100%;
		}
	}

	#settingsButtons {
		display: flex;
		justify-content: left;
		gap: 1rem;
	}

	#settingsButton {
		background-color: #000;
		color: #fff;
		border: none;
		border-radius: 5px;
		padding: 0.5rem;
		margin-top: 0.5rem;
		cursor: pointer;
		text-decoration: none;
		width: fit-content;
		transition: all 0.2s ease-in-out;
		font-weight: 500;
		font-size: 1rem;

		&:hover {
			background-color: #333;
		}
	}

	.warn {
		background-color: rgb(255, 81, 0);
		border-radius: 1rem;
		padding: .5rem;
		color: #fff;
		width: fit-content;
	}

	#menu {
		width: 90%;
		height: 100%;
		display: flex;
		flex-direction: column;

		#topbar {
			margin-top: 3rem;
			display: flex;
			align-items: center;
			justify-content: space-between;

			h1 {
				font-size: 2.5rem;
				font-weight: 700;
				margin-bottom: 1rem;
			}

			#signout {
				cursor: pointer;
				outline: none;
				border: none;
				background-color: transparent;
				margin-top: 1rem;

				img {
					height: 3rem;
				}
			}
		}

		#projects {
			display: flex;
			flex-wrap: wrap;
			gap: 1rem;

			.project {
				background-color: #0077fa;
				color: #fff;
				border: none;
				border-radius: 15px;
				padding: 1rem;
				cursor: pointer;
				transition: all 0.2s ease-in-out;
				min-width: 180px;
				text-decoration: none;

				h2 {
					margin: 0;
				}

				&:hover {
					background-color: #01003f;
				}
			}

			#loadingProject {
				background-color: transparent;
				padding: 1rem;
				cursor: progress;
				max-height: 110px;
				max-width: 110px;
				min-width: 110px;

				img {
					height: 100%;
				}
			}
		}

		#settingsWrapper {
			display: flex;
			flex-direction: column;
			width: 90%;

			h1, h2 {
				margin: 0;
			}

			p {
				margin: 0;
			}

			#branch {
				display: flex;
				flex-direction: row;
				justify-content: space-between;

				margin: 0.5rem 0;

				button, input[type="submit"] {
					border: none;
					background-color: #0077fa;
					color: #fff;
					border-radius: 5px;
					padding: 0.25rem 0;
					cursor: pointer;

					&:hover {
						background-color: #01003f;
					}
				}

				#branch-name {
					display: flex;
					flex-direction: row;
					align-items: center;

					p {
						min-width: 180px;
						margin: 0;
					}

					button {
						margin-left: 1rem;
						width: 90px;
					}

					input[type="text"] {
						width: 172px;
						border-radius: 5px;
						border: 1px solid #000;
					}

					input[type="submit"] {
						margin-left: 1rem;
						width: 90px;
					}
				}
			}
		}

		p {
			font-size: 1rem;
			font-weight: 400;
			margin: 0;
		}
	}

	@media (max-width: 360px) {
		#logo {
			top: 1rem;
			left: 0.5rem;
			transform: none;
		}
	}
</style>
