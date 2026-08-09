# Local aggregate aliases: a decision study

> **Status:** Working analysis, not part of either Nucleus specification.
> The examples follow the language rules at source revision `f573200`.

This study tests whether routine-local aggregate aliases provide enough value
to justify their declaration and binding rules. It keeps routine-private
aggregate storage separate from aliasing: removing storage-path aliases would
not require removing locally scoped static aggregate objects.

## Common declarations

The examples use these types and objects:

```nucleus
record Address
    streetNumber as u16
    postcode as u16
    verified as boolean
end

record Person
    identifier as u16
    address as Address
end

record Entry
    value as u16
    active as boolean
end

var people as Person[8]
var entries as Entry[8]
var retained as Entry
```

An aggregate parameter is already a fixed alias to caller-provided storage.
The question examined here is narrower: whether a routine should also be able
to give an aggregate storage path a fixed local name.

## Scalar extraction

A routine that reads one scalar field gains nothing from a local aggregate
alias:

```nucleus
sub postalCode(person as Person) as u16
    return person.address.postcode
end
```

The alias form adds a declaration without simplifying the operation:

```nucleus
sub postalCodeWithAlias(person as Person) as u16
    var address as Address = person.address

    return address.postcode
end
```

Both routines read the same field from the caller's object. The direct form is
shorter and requires no local alias slot.

## Repeated access to a nested record

Several writes make the shorter path more useful:

```nucleus
sub verifyAddress(person as Person)
    person.address.postcode = 3000
    person.address.verified = true
end
```

```nucleus
sub verifyAddressWithAlias(person as Person)
    var address as Address = person.address

    address.postcode = 3000
    address.verified = true
end
```

The alias version computes the address of the nested subobject once. Record
field offsets are compile-time constants, however, so this example mainly buys
a shorter name. It does not add expressive power or remove a runtime bounds
check.

## Repeated access to an array element

An indexed path has a stronger case because binding performs the bounds check
and element-address calculation once:

```nucleus
sub activate(index as u8)
    entries[index].value = 7
    entries[index].active = true
end
```

```nucleus
sub activateWithAlias(index as u8)
    var current as Entry = entries[index]

    current.value = 7
    current.active = true
end
```

A simple streaming compiler may emit two bounds checks and two element-address
calculations for the direct form. The alias form requires one checked path
evaluation and retains the resulting address in one slot. An optimizer could
remove the repeated work, but the first Nucleus compiler is not required to
perform that analysis.

## A selection that survives an index change

An alias fixes the selected element at its declaration:

```nucleus
sub activateThenAdvance(index as u8)
    var current as Entry = entries[index]

    index = index + 1
    current.active = true
end
```

The same behaviour remains expressible with a scalar local:

```nucleus
sub activateThenAdvanceWithoutAlias(index as u8)
    var selectedIndex as u8 = index

    index = index + 1
    entries[selectedIndex].active = true
end
```

The scalar form preserves the original index but performs the bounds check and
address calculation when the field is written. If the routine performs several
writes, it repeats that work unless the compiler recognizes the common path.

The alias therefore provides stable selection, but it does not make the
operation possible. A scalar index can record the selection whenever the
aggregate comes from an array.

## Passing a nested aggregate to another routine

Aggregate parameters already accept storage paths directly:

```nucleus
sub clearAddress(address as Address)
    address.streetNumber = 0
    address.postcode = 0
    address.verified = false
end

sub clearPerson(person as Person)
    clearAddress(person.address)
end
```

A local alias adds no capability here:

```nucleus
sub clearPersonWithAlias(person as Person)
    var address as Address = person.address

    clearAddress(address)
end
```

The call already transfers the nested object's address. Removing local aliases
would leave aggregate parameters and direct storage-path arguments unchanged.

## Routine-private aggregate storage

Owning aggregate locals solve a different problem:

```nucleus
sub preparedEntry(input as Entry) as Entry
    var scratch as Entry

    scratch = input
    scratch.active = true
    return scratch
end

sub retainPreparedEntry()
    retained = preparedEntry(entries[0])
end
```

`scratch` is one routine-private static object. It is zero-initialized before
`main`, shared by every invocation, and valid as an aggregate result because it
has program lifetime. The assignment to `retained` materializes the transient
result by copying the complete `Entry`.

This example uses address-based aggregate parameters and results, but it uses
no storage-path alias local. Nucleus could remove local aliases while retaining
routine-private aggregate storage.

## Assignment does not rebind

The most important usability hazard appears when an alias is the destination
of aggregate assignment:

```nucleus
sub replaceFirstEntry()
    var selected as Entry = entries[0]

    selected = entries[1]
end
```

The final statement copies every byte of `entries[1]` into `entries[0]`.
`selected` remains bound to `entries[0]`; assignment never changes an alias
binding.

The direct spelling exposes the destination more clearly:

```nucleus
sub replaceFirstEntryDirectly()
    entries[0] = entries[1]
end
```

This difference does not make the alias unsafe, but programmers must understand
that an aggregate name on the left side always denotes storage to be changed.
No Nucleus assignment stores or reseats an address.

## Implementation comparison

Removing storage-path alias locals would remove:

- one aggregate-local initializer category;
- one per-activation path-binding operation;
- local-alias capacity accounting and diagnostics; and
- local symbol metadata that distinguishes a fixed alias from owning static
  storage.

It would not remove:

- typed address carriers for aggregate parameters;
- transient aggregate result carriers;
- storage-path checking and address calculation;
- program-lifetime provenance checks;
- exact-type aggregate assignment; or
- aggregate copy lowering.

The compiler and VM already need most of the underlying address machinery for
calls and results. The likely implementation saving is therefore smaller than
the surface-language deletion suggests. Measurement of the compiler model is
still required.

## Provisional assessment

Local aggregate aliases add little value for scalar extraction, simple nested
fields, or passing a subobject to another routine. Direct storage paths cover
those cases cleanly.

Indexed aggregates provide the strongest justification. A fixed local alias
performs one bounds check, retains one calculated address, and preserves the
selection when the index later changes. The same programs remain expressible
with scalar indices, but repeated access can cost more code and more checks in
a streaming compiler without optimization.

The current evidence does not justify adding an `alias` keyword. Such a keyword
would add syntax without removing the underlying mechanism. The useful choice
is between retaining the existing storage-path initializer and removing local
alias bindings altogether. A compiler-size and emitted-code measurement should
decide that choice.
