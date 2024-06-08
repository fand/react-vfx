import * as React from "react";
import { useEffect, useRef, useContext } from "react";
import { VFXContext } from "./context";
import { VFXProps } from "./types";

type VFXElementProps<T extends keyof JSX.IntrinsicElements> =
    JSX.IntrinsicElements[T] & VFXProps;

function VFXElementFactory<T extends keyof JSX.IntrinsicElements>(
    type: T,
): React.ForwardRefExoticComponent<
    React.PropsWithoutRef<VFXElementProps<T>> & React.RefAttributes<HTMLElement>
> {
    return React.forwardRef(function VFXElement(
        props: VFXElementProps<T>,
        parentRef: React.ForwardedRef<HTMLElement>,
    ) {
        const player = useContext(VFXContext);

        const elementRef = useRef<HTMLElement | undefined>();
        const ref = (e: HTMLElement): void => {
            elementRef.current = e;
            if (parentRef instanceof Function) {
                parentRef(e);
            } else if (parentRef) {
                parentRef.current = e;
            }
        };

        const { shader, release, uniforms, overflow, ...rawProps } = props;

        // Create scene
        useEffect(() => {
            const element = elementRef.current;
            if (element === undefined) {
                return;
            }

            player?.addElement(element, {
                shader,
                release,
                uniforms,
                overflow,
            });

            return () => {
                player?.removeElement(element);
            };
        }, [elementRef, player, shader, release, uniforms, overflow]);

        // Rerender if the content is updated
        useEffect(() => {
            if (elementRef.current === undefined) {
                return;
            }

            player?.updateTextElement(elementRef.current);
        }, [player, props.children]);

        return React.createElement(type, { ...rawProps, ref });
    });
}

export default VFXElementFactory;
