# Dex

## Quickstart

Development on `yari` involves updating the machinery that renders MDN content
or improving the structure and styling of the MDN UI (e.g. the styling of the
header). If you are more interested in contributing to the MDN content, you
should check out the [content](https://github.com/mdn/content) repo README
instead.

Before you can start working with Yari, you need to:

<!-- Peterbe, Feb 2021: There appears to be a bug in Prettier for .md files
    that forces in a second (extra) whitespace after the `1.` here.
    That breaks `markdownlint` *and* `prettier --check`. Annoying.
    So for now let's make an exception. -->
<!-- markdownlint-disable list-marker-space -->

1.  Install [git](https://git-scm.com/), [Node.js](https://nodejs.org), and
    [Yarn 1](https://classic.yarnpkg.com/en/docs/install).

1.  [Fork](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo)
    the MDN [content](https://github.com/mdn/content) and
    [yari](https://github.com/mdn/yari) repositories using the Fork button on
    GitHub.

1.  Clone the forked repositories to your computer using the following commands
    (replace `[your account]` with the account you forked the repositories to):

        git clone https://github.com/[your_account]/content.git
        git clone https://github.com/[your_account]/yari.git

<!-- markdownlint-enable list-marker-space -->

To run Yari locally, you'll first need to install its dependencies and build the
app locally. Do this like so:

    cd yari
    yarn install

See the [troubleshooting](#troubleshooting) section below if you run into
problems.

See also our [reviewing guide](docs/REVIEWING.md) for information on how to
review Yari changes.

### Pull request requirements

Firstly, thank you for your interest in contributing to Yari! We do have a few
requirements when it comes to pull requests:

1. Please make use of a
   [feature branch workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow).
2. We prefer if you use the
   [conventional commits format](https://www.conventionalcommits.org/) when
   making pull requests.
3. Lastly, we require that all commits are signed. Please see the documentation
   [about signed commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)
   and
   [how to sign yours](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits)
   on GitHub.

Thank you for your understanding! We look forward to your contributions.

### How to stay up-to-date

Periodically, the code and the content changes. Make sure you stay up-to-date
with something along the following lines (replace `yari-origin` with whatever
you called [the remote location](https://git-scm.com/docs/git-remote) of the
original yari repo):

    git pull yari-origin main
    yarn
    yarn dev

When you embark on making a change, do it on a new branch, for example
`git checkout -b my-new-branch`.

## License

All source code is [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/).

For content, see its
[license](https://github.com/mdn/content/blob/main/LICENSE.md) in the
[mdn/content repository](https://github.com/mdn/content).

## Supported Platforms

`yari` runs on Linux in CI, and when building for Production.

We also support Windows and MacOS, however we don't aim to proactively catch
issues with CI on those platforms. If bugs arise, we welcome issues being filed,
or PRs being opened to fix them.

### Linting

All JavaScript and TypeScript code needs to be formatted with `prettier` and
it's easy to test this with:

    yarn prettier-check

And conveniently, if you're not even interested in what the flaws were, run:

    yarn prettier-format

When you ran `yarn` for the first time (`yarn` is an alias for `yarn install`)
it automatically sets up a `git` pre-commit hook that uses `lint-staged` — a
wrapper for `prettier` that checks only the files in the git commit.

If you have doubts about formatting, submit your pull request anyway. If you
have formatting flaws, the
[pull request checks](https://github.com/features/actions) should catch it.

### Upgrading Packages

We maintain the dependencies using `Dependabot` in GitHub but if you want to
manually upgrade them you can use:

    yarn upgrade-interactive --latest

## Contact

If you want to talk to us, ask questions, and find out more, join the discussion
on the
[MDN Web Docs chat room](https://chat.mozilla.org/#/room/#mdn:mozilla.org) on
[Matrix](https://wiki.mozilla.org/Matrix).

## Troubleshooting

Some common issues and how to resolve them.

### Yarn install errors

If you get errors while installing dependencies via yarn on a Mac, you may need
to install some additional packages. Check the error message for the package
name causing the problem.

1. First, install [brew](https://brew.sh/) if you haven’t already

1. To fix problems with `gifsicle`:

   brew install automake autoconf libtool

1. To fix problems with `pngquant-bin`:

   brew install pkg-config

1. To fix problems with `mozjpeg`:

   brew install libpng sudo ln -s
   /opt/homebrew/Cellar/libpng/1.6.40/lib/libpng16.a /usr/local/lib/libpng16.a

You may need to adjust the path to `libpng16.a` depending on the version of
`libpng` you have installed.
