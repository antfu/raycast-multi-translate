# Raycast MutliTranslate

Forked from https://github.com/raycast/extensions/tree/main/extensions/google-translate, thanks to [@gebeto](https://github.com/gebeto) et al.

## Motivation

I speak Chinese, work in English, live in France, and sometimes also consume Japanese content. I do language-switching all the time. For example, I'd like to know what's the meaning of a new English word, find the English translation of a Chinese word, or verify if my French sentence is correct, etc. Most of the time I just need a quick answer, but I found I spend quite a lot of time telling the translator which language **from** and **to**, which can be detected automatically. So instead of setting the language manually everytime, let's translate it to all languages we use at once.

<img width="862" src="https://github.com/antfu/raycast-multi-translate/assets/11247099/49e80bbe-e81e-4ba7-93da-906329c70830" />

## Changes in this Fork

- Support translating for any language to multiple languages at once
- Removed the representation of flag emojis, as languages are not countries
- Removed the `Translate From` command, and the language selection dropdown, as they are automatized
- Show details view by default
- Make "Use current selection" passive and don't interfere the input field

## Installation

Currently you need to clone this repo and install it locally in developer mode.

There is **no plan** to publish to the bloated [raycast/extensions](https://github.com/raycast/extensions) until they make a decentralized publishing system.

## TODO

- [ ] Verify by translating back
- [ ] Integrate with the dictionary plugin to correct the spelling
