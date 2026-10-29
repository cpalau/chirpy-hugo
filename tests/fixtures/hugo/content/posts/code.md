---
title: "Fixture 2: code blocks"
date: 2026-01-02T09:00:00Z
author: example
description: "Code blocks in many languages, with and without line numbers and filenames."
categories: ["guides"]
tags: ["alpha", "code"]
---

## Line numbers by default

```javascript
const answer = 42;
console.log(`The answer is ${answer}`);
```

## Without line numbers

```shell {.nolineno}
bundle exec jekyll build --destination .out/oracle
```

## With a filename

```yaml {file="_config.yml"}
title: "Chirpy Fixtures"
timezone: UTC
```

## Languages that never show line numbers

```console
$ hugo --panicOnWarning --gc --minify
```

```terminal
~/project $ git status
On branch main
```

```plaintext
no highlighting here, just text
```

## More languages

```ruby
class Greeter
  def initialize(name)
    @name = name
  end
end
```

```go
package main

func main() {
	println("hello")
}
```

```rust
fn main() {
    let answer: u32 = 42;
    println!("{}", answer);
}
```

```html
<!doctype html>
<html lang="en">
  <head><title>Example</title></head>
  <body></body>
</html>
```

```css
:root {
  --chirpy-accent: #2f6f9f;
}
```

```sql
SELECT id, title FROM posts WHERE pinned IS TRUE ORDER BY date DESC;
```

```diff
- old line
+ new line
```
