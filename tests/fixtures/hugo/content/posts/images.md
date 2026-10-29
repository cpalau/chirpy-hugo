---
title: "Fixture 7: images"
date: 2026-01-07T09:00:00Z
author: example
description: "Image classes: float, theme visibility, shadow, normal, and the popup wrapper."
categories: ["media"]
tags: ["images"]
media_subpath: /assets/img/fixtures
---

## Floats

{{< img src="img-left.png" alt="Floating left" class="left" >}}
Text that flows next to the image on the left. It needs to be long enough to
wrap around it on a wide viewport, otherwise the float has no visible effect.

{{< img src="img-right.png" alt="Floating right" class="right" >}}
Text that flows next to the image on the right. Same idea, opposite side.

## Theme visibility

{{< img src="img-light.png" alt="Visible in light mode only" class="light" >}}

{{< img src="img-dark.png" alt="Visible in dark mode only" class="dark" >}}

## Shadow and normal

{{< img src="img-shadow.png" alt="With a drop shadow" class="shadow" >}}

{{< img src="img-normal.png" alt="Forced to normal flow" class="normal" >}}

## Plain image

![An image without any class](img-normal.png)

## Size

{{< img src="img-normal.png" alt="With explicit dimensions" width=320 height=180 >}}
